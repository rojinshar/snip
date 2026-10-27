//! Snip menu-bar app: hotkey → native region capture → Snip API → LaTeX on the clipboard.
//! Design: docs/desktop-v0.md.

mod api;
mod capture;
mod format;
mod image_prep;
mod metrics;
mod permissions;

use std::fs;
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use api::{ApiClient, ApiError};
use capture::{capture_region, CaptureOutcome};
use format::{preview, wrap, Delimiters};
use metrics::SnipTimings;
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use tauri_plugin_notification::NotificationExt;

const TRAY_ID: &str = "main";

/// Default hotkey ⌘⇧2 (docs/desktop-v0.md §13). Configurable in M5.
fn snip_shortcut() -> Shortcut {
    Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::Digit2)
}

struct SnipState {
    /// Prevents a second snip from starting while one is in progress.
    busy: AtomicBool,
    /// System Settings is opened at most once per launch, so a missing permission can't
    /// turn every hotkey press into another trip to Settings.
    opened_permission_settings: AtomicBool,
    api: ApiClient,
}

/// Why a snip did not produce LaTeX.
#[derive(Debug, PartialEq)]
enum Failure {
    Capture(String),
    Image(String),
    Api(ApiError),
    Clipboard(String),
}

/// What one snip attempt ended in.
#[derive(Debug, PartialEq)]
enum SnipResult {
    NeedsPermission,
    Cancelled,
    /// `text` is exactly what was written to the clipboard.
    Copied {
        text: String,
    },
    Failed(Failure),
}

pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() == ShortcutState::Pressed && *shortcut == snip_shortcut() {
                        start_snip(app.clone());
                    }
                })
                .build(),
        )
        .manage(SnipState {
            busy: AtomicBool::new(false),
            opened_permission_settings: AtomicBool::new(false),
            api: ApiClient::from_env(),
        })
        .setup(|app| {
            // Menu-bar app: no Dock icon, no app-switcher entry.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            build_tray(app.handle())?;
            if let Err(error) = app.global_shortcut().register(snip_shortcut()) {
                log::error!("could not register ⌘⇧2: {error}");
                notify(
                    app.handle(),
                    "Snip",
                    "⌘⇧2 is taken by another app. Use the menu-bar icon.",
                );
            }
            log::info!("Snip ready");
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build Snip")
        .run(|_app, event| {
            // Stay alive with no windows open; only quit on an explicit exit.
            if let tauri::RunEvent::ExitRequested {
                api, code: None, ..
            } = event
            {
                api.prevent_exit();
            }
        });
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let snip = MenuItem::with_id(
        app,
        "snip",
        "Snip Equation",
        true,
        Some("CmdOrCtrl+Shift+2"),
    )?;
    // macOS only applies a new Screen Recording grant after the app relaunches.
    let restart = MenuItem::with_id(app, "restart", "Restart Snip", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Snip", true, Some("CmdOrCtrl+Q"))?;
    let menu = Menu::with_items(
        app,
        &[&snip, &PredefinedMenuItem::separator(app)?, &restart, &quit],
    )?;

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(Image::from_bytes(include_bytes!(
            "../icons/tray-template.png"
        ))?)
        .icon_as_template(true)
        .tooltip("Snip")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "snip" => start_snip(app.clone()),
            "restart" => app.restart(),
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(())
}

fn start_snip(app: AppHandle) {
    if app.state::<SnipState>().busy.swap(true, Ordering::SeqCst) {
        log::info!("snip already in progress; ignoring");
        return;
    }
    // Capture blocks on the user and recognition on the network: keep both off the main thread.
    std::thread::spawn(move || {
        let result = run_snip(&app);
        log::info!("snip result: {result:?}");
        if result == SnipResult::NeedsPermission
            && !app
                .state::<SnipState>()
                .opened_permission_settings
                .swap(true, Ordering::SeqCst)
        {
            let _ = Command::new("open")
                .arg(permissions::SCREEN_RECORDING_SETTINGS_URL)
                .status();
        }
        if let Some((title, body)) = notification_for(&result) {
            notify(&app, &title, &body);
        }
        app.state::<SnipState>().busy.store(false, Ordering::SeqCst);
    });
}

fn run_snip(app: &AppHandle) -> SnipResult {
    if !permissions::has_screen_recording_access()
        && !permissions::request_screen_recording_access()
    {
        return SnipResult::NeedsPermission;
    }

    let dir = match app.path().app_cache_dir() {
        Ok(dir) => dir.join("captures"),
        Err(error) => {
            return SnipResult::Failed(Failure::Capture(format!("no cache directory: {error}")))
        }
    };
    let path = match capture_region(&dir) {
        Ok(CaptureOutcome::Captured(path)) => path,
        Ok(CaptureOutcome::Cancelled) => return SnipResult::Cancelled,
        Err(error) => return SnipResult::Failed(Failure::Capture(error.to_string())),
    };

    // The latency budget starts when the user releases the mouse.
    let released = Instant::now();
    let mut timings = SnipTimings {
        at: unix_millis(),
        ..Default::default()
    };
    set_busy_indicator(app, true);
    let result = recognize_capture(app, &path, released, &mut timings);
    set_busy_indicator(app, false);

    timings.total_ms = released.elapsed().as_millis();
    timings.outcome = match &result {
        SnipResult::Copied { .. } => "copied".into(),
        other => format!("{other:?}").chars().take(120).collect(),
    };
    record_timings(app, &timings);
    if std::env::var_os("SNIP_KEEP_CAPTURES").is_none() {
        let _ = fs::remove_file(&path);
    }
    result
}

fn recognize_capture(
    app: &AppHandle,
    path: &std::path::Path,
    released: Instant,
    timings: &mut SnipTimings,
) -> SnipResult {
    let png = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) => return SnipResult::Failed(Failure::Image(error.to_string())),
    };
    let prepared = match image_prep::prepare_for_upload(png, image_prep::MAX_EDGE) {
        Ok(prepared) => prepared,
        Err(error) => return SnipResult::Failed(Failure::Image(error.to_string())),
    };
    timings.prepare_ms = released.elapsed().as_millis();
    timings.width = prepared.width;
    timings.height = prepared.height;
    timings.upload_bytes = prepared.png.len();
    timings.resized = prepared.resized;

    let request_started = Instant::now();
    let recognition = app.state::<SnipState>().api.recognize(&prepared.png);
    timings.request_ms = request_started.elapsed().as_millis();

    let recognition = match recognition {
        Ok(recognition) => recognition,
        Err(error) => return SnipResult::Failed(Failure::Api(error)),
    };
    timings.server_ms = Some(recognition.ms);
    timings.engine = Some(recognition.engine.clone());

    let text = wrap(&recognition.latex, Delimiters::default());
    match app.clipboard().write_text(text.clone()) {
        Ok(()) => SnipResult::Copied { text },
        Err(error) => SnipResult::Failed(Failure::Clipboard(error.to_string())),
    }
}

/// Shows "…" next to the menu-bar icon while waiting for recognition.
fn set_busy_indicator(app: &AppHandle, busy: bool) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_title(if busy { Some("…") } else { None });
    }
}

fn record_timings(app: &AppHandle, timings: &SnipTimings) {
    log::info!("snip timings: {timings:?}");
    if let Ok(dir) = app.path().app_log_dir() {
        if let Err(error) = metrics::append(&dir.join("snips.jsonl"), timings) {
            log::warn!("could not record timings: {error}");
        }
    }
}

/// The notification to show for a result, or None to stay silent (cancel).
fn notification_for(result: &SnipResult) -> Option<(String, String)> {
    let message = |title: &str, body: &str| Some((title.to_string(), body.to_string()));
    match result {
        SnipResult::Cancelled => None,
        SnipResult::Copied { text } => message("Copied to clipboard", &preview(text, 80)),
        SnipResult::NeedsPermission => message(
            "Snip needs Screen Recording access",
            "Turn on Snip in Privacy & Security → Screen Recording, then choose Restart Snip from the ∫ menu.",
        ),
        SnipResult::Failed(Failure::Api(ApiError::Server { code, .. })) => match code.as_str() {
            "no_math_found" => message("No equation found", "Try selecting just the equation."),
            "invalid_image" | "image_too_large" => {
                message("Couldn't read that selection", "Try a smaller selection.")
            }
            _ => message("Recognition unavailable", "Snip couldn't read it right now. Try again."),
        },
        SnipResult::Failed(Failure::Api(ApiError::Unreachable(_))) => {
            message("Snip couldn't reach the server", "Check that the Snip API is running.")
        }
        SnipResult::Failed(Failure::Api(ApiError::Timeout | ApiError::BadResponse(_))) => {
            message("Recognition unavailable", "Snip couldn't read it right now. Try again.")
        }
        SnipResult::Failed(Failure::Capture(_) | Failure::Image(_) | Failure::Clipboard(_)) => {
            message("Snip failed", "Something went wrong. Try again.")
        }
    }
}

fn notify(app: &AppHandle, title: &str, body: &str) {
    if let Err(error) = app.notification().builder().title(title).body(body).show() {
        log::warn!("notification failed: {error}");
    }
}

fn unix_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn api_error(code: &str) -> SnipResult {
        SnipResult::Failed(Failure::Api(ApiError::Server {
            status: 422,
            code: code.into(),
        }))
    }

    #[test]
    fn cancel_is_silent() {
        assert_eq!(notification_for(&SnipResult::Cancelled), None);
    }

    #[test]
    fn copied_shows_a_flattened_preview() {
        let result = SnipResult::Copied {
            text: "$\\frac{a}{b}$".into(),
        };
        assert_eq!(
            notification_for(&result),
            Some(("Copied to clipboard".into(), "$\\frac{a}{b}$".into()))
        );
    }

    #[test]
    fn api_errors_map_to_actionable_messages() {
        assert_eq!(
            notification_for(&api_error("no_math_found")).unwrap().0,
            "No equation found"
        );
        assert_eq!(
            notification_for(&api_error("image_too_large")).unwrap().0,
            "Couldn't read that selection"
        );
        assert_eq!(
            notification_for(&api_error("upstream_failed")).unwrap().0,
            "Recognition unavailable"
        );
        assert_eq!(
            notification_for(&api_error("something_new")).unwrap().0,
            "Recognition unavailable"
        );
        let unreachable = SnipResult::Failed(Failure::Api(ApiError::Unreachable("refused".into())));
        assert_eq!(
            notification_for(&unreachable).unwrap().0,
            "Snip couldn't reach the server"
        );
    }

    #[test]
    fn internal_details_stay_out_of_notifications() {
        let (_, body) = notification_for(&SnipResult::Failed(Failure::Capture(
            "disk full at /x".into(),
        )))
        .unwrap();
        assert!(!body.contains("/x"));
    }

    #[test]
    fn permission_message_points_to_settings() {
        let (title, body) = notification_for(&SnipResult::NeedsPermission).unwrap();
        assert!(title.contains("Screen Recording"));
        assert!(body.contains("Screen Recording"));
        // A grant only takes effect after a relaunch, so the message must say so.
        assert!(body.contains("Restart Snip"));
    }

    #[test]
    fn shortcut_is_cmd_shift_2() {
        assert_eq!(
            snip_shortcut(),
            Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::Digit2)
        );
    }
}
