//! Snip menu-bar app: hotkey → native region capture → Snip API → LaTeX on the clipboard.
//! Design: docs/desktop-v0.md.

mod access_key;
mod api;
mod capture;
mod format;
mod image_prep;
mod metrics;
mod permissions;
mod settings;
mod settings_window;

use std::fs;
use std::process::Command;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use api::{ApiClient, ApiError};
use capture::{capture_region, CaptureOutcome};
use format::{month_day, preview, wrap};
use metrics::SnipTimings;
use settings_window::SettingsState;
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, Wry};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_global_shortcut::ShortcutState;
use tauri_plugin_notification::NotificationExt;

const TRAY_ID: &str = "main";

struct SnipState {
    /// Prevents a second snip from starting while one is in progress.
    busy: AtomicBool,
    /// System Settings is opened at most once per launch, so a missing permission can't
    /// turn every hotkey press into another trip to Settings.
    opened_permission_settings: AtomicBool,
    /// Bumped on every tray-title change, so a delayed clear can tell it is out of date.
    tray_title_generation: AtomicU64,
    api: ApiClient,
}

/// How long the ✓ or ! stays next to the menu-bar icon after a snip.
const RESULT_MARK_DURATION: Duration = Duration::from_secs(2);

/// Why a snip did not produce LaTeX.
#[derive(Debug, PartialEq)]
enum Failure {
    Capture(String),
    Image(String),
    Api(ApiError),
    /// The API wants a key and none is saved; a rejected key stays `Api(invalid_key)`.
    NoAccessKey,
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
                // Snip registers exactly one shortcut: the hotkey from settings.
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        start_snip(app.clone());
                    }
                })
                .build(),
        )
        .manage(SnipState {
            busy: AtomicBool::new(false),
            opened_permission_settings: AtomicBool::new(false),
            tray_title_generation: AtomicU64::new(0),
            api: ApiClient::from_env(),
        })
        .setup(|app| {
            // Menu-bar app: no Dock icon, no app-switcher entry.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let settings_path = app.path().app_config_dir()?.join(settings::FILE_NAME);
            let current = settings::load(&settings_path);
            let snip_item = build_tray(app.handle(), &current.hotkey)?;
            app.manage(SettingsState::new(settings_path, current, snip_item));
            if settings_window::register_current_hotkey(app.handle()).is_err() {
                notify(
                    app.handle(),
                    "Snip's hotkey is taken",
                    "Another app is using it. Choose a new one in Settings, or use the menu-bar icon.",
                );
            }
            log::info!("Snip ready");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            settings_window::get_settings,
            settings_window::set_hotkey,
            settings_window::set_delimiters,
            settings_window::pause_hotkey,
            settings_window::resume_hotkey,
            settings_window::get_access_status,
            settings_window::set_access_key,
            settings_window::clear_access_key,
        ])
        .on_window_event(|window, event| {
            // Closing the window mid-recording must not leave Snip without a hotkey.
            if window.label() == settings_window::WINDOW_LABEL
                && matches!(event, tauri::WindowEvent::Destroyed)
            {
                let _ = settings_window::register_current_hotkey(window.app_handle());
            }
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

/// Builds the menu-bar icon and menu. Returns the Snip Equation item so its shortcut label
/// can follow the hotkey setting.
fn build_tray(app: &AppHandle, hotkey: &str) -> tauri::Result<MenuItem<Wry>> {
    let snip = MenuItem::with_id(app, "snip", "Snip Equation", true, Some(hotkey))?;
    let settings = MenuItem::with_id(app, "settings", "Settings…", true, Some("Cmd+Comma"))?;
    // macOS only applies a new Screen Recording grant after the app relaunches.
    let restart = MenuItem::with_id(app, "restart", "Restart Snip", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Snip", true, Some("CmdOrCtrl+Q"))?;
    // Disabled; shows which build is installed.
    let version = MenuItem::with_id(
        app,
        "version",
        format!("Version {}", app.package_info().version),
        false,
        None::<&str>,
    )?;
    let menu = Menu::with_items(
        app,
        &[
            &snip,
            &PredefinedMenuItem::separator(app)?,
            &settings,
            &version,
            &restart,
            &quit,
        ],
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
            "settings" => settings_window::open(app),
            "restart" => app.restart(),
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(snip)
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
        if needs_access_key(&result) {
            settings_window::open(&app);
        }
        // Visible even when macOS mutes the notification (screen sharing, Focus).
        show_result_mark(&app, result_mark(&result));
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
    let access_key = settings_window::access_key_path(app)
        .ok()
        .and_then(|path| access_key::load(&path));
    let recognition = app
        .state::<SnipState>()
        .api
        .recognize(&prepared.png, access_key.as_deref());
    timings.request_ms = request_started.elapsed().as_millis();

    let recognition = match recognition {
        Ok(recognition) => recognition,
        Err(ApiError::Server { code, .. }) if code == "invalid_key" && access_key.is_none() => {
            return SnipResult::Failed(Failure::NoAccessKey)
        }
        Err(error) => return SnipResult::Failed(Failure::Api(error)),
    };
    timings.server_ms = Some(recognition.ms);
    timings.engine = Some(recognition.engine.clone());

    let delimiters = app.state::<SettingsState>().current().delimiters;
    let text = wrap(&recognition.latex, delimiters);
    match app.clipboard().write_text(text.clone()) {
        Ok(()) => SnipResult::Copied { text },
        Err(error) => SnipResult::Failed(Failure::Clipboard(error.to_string())),
    }
}

/// Shows "…" next to the menu-bar icon while waiting for recognition.
fn set_busy_indicator(app: &AppHandle, busy: bool) {
    set_tray_title(app, busy.then_some("…"));
}

/// The mark shown next to the menu-bar icon when a snip ends: ✓ copied, ! needs attention.
fn result_mark(result: &SnipResult) -> Option<&'static str> {
    match result {
        SnipResult::Copied { .. } => Some("✓"),
        SnipResult::Cancelled => None,
        SnipResult::NeedsPermission | SnipResult::Failed(_) => Some("!"),
    }
}

fn show_result_mark(app: &AppHandle, mark: Option<&'static str>) {
    let generation = set_tray_title(app, mark);
    if mark.is_none() {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(RESULT_MARK_DURATION);
        // Leave it alone if anything changed it since, such as a new snip's "…".
        let current = app
            .state::<SnipState>()
            .tray_title_generation
            .load(Ordering::SeqCst);
        if current == generation {
            set_tray_title(&app, None);
        }
    });
}

/// Sets the text next to the menu-bar icon and returns the new generation.
fn set_tray_title(app: &AppHandle, title: Option<&str>) -> u64 {
    let generation = app
        .state::<SnipState>()
        .tray_title_generation
        .fetch_add(1, Ordering::SeqCst)
        + 1;
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_title(title);
    }
    generation
}

fn record_timings(app: &AppHandle, timings: &SnipTimings) {
    log::info!("snip timings: {timings:?}");
    if let Ok(dir) = app.path().app_log_dir() {
        if let Err(error) = metrics::append(&dir.join("snips.jsonl"), timings) {
            log::warn!("could not record timings: {error}");
        }
    }
}

/// A missing or rejected key: the fix is in the settings window, so open it.
fn needs_access_key(result: &SnipResult) -> bool {
    match result {
        SnipResult::Failed(Failure::NoAccessKey) => true,
        SnipResult::Failed(Failure::Api(ApiError::Server { code, .. })) => code == "invalid_key",
        _ => false,
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
        SnipResult::Failed(Failure::Api(ApiError::Server {
            code, resets_at, ..
        })) => match code.as_str() {
            "no_math_found" => message("No equation found", "Try selecting just the equation."),
            "invalid_key" => message(
                "Access key not accepted",
                "Check the key in Settings. It may be mistyped or no longer active.",
            ),
            "quota_exceeded" => {
                let resets = resets_at.as_deref().and_then(month_day);
                let body = match resets {
                    Some(day) => format!("This month's snips are used up. They reset on {day}."),
                    None => "This month's snips are used up. They reset next month.".into(),
                };
                Some(("Monthly snips used up".to_string(), body))
            }
            "rate_limited" => message(
                "Slow down a little",
                "Too many snips in a minute. Try again shortly.",
            ),
            "capacity" => message("Snip is busy", "Try again in a little while."),
            "invalid_image" | "image_too_large" => {
                message("Couldn't read that selection", "Try a smaller selection.")
            }
            _ => message("Recognition unavailable", "Snip couldn't read it right now. Try again."),
        },
        SnipResult::Failed(Failure::NoAccessKey) => message(
            "Snip needs your access key",
            "Paste the key from your invite in Settings.",
        ),
        SnipResult::Failed(Failure::Api(ApiError::Unreachable(_))) => {
            message("Snip couldn't reach the server", "Check your internet connection and try again.")
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
            resets_at: None,
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
    fn quota_and_load_errors_explain_what_to_do() {
        let used_up = SnipResult::Failed(Failure::Api(ApiError::Server {
            status: 429,
            code: "quota_exceeded".into(),
            resets_at: Some("2026-11-01T00:00:00.000Z".into()),
        }));
        let (title, body) = notification_for(&used_up).unwrap();
        assert_eq!(title, "Monthly snips used up");
        assert!(body.contains("Nov 1"), "{body}");
        assert_eq!(
            notification_for(&api_error("rate_limited")).unwrap().0,
            "Slow down a little"
        );
        assert_eq!(
            notification_for(&api_error("capacity")).unwrap().0,
            "Snip is busy"
        );
    }

    #[test]
    fn result_marks_show_success_and_problems_but_not_cancels() {
        let copied = SnipResult::Copied { text: "$x$".into() };
        assert_eq!(result_mark(&copied), Some("✓"));
        assert_eq!(result_mark(&SnipResult::Cancelled), None);
        assert_eq!(result_mark(&SnipResult::NeedsPermission), Some("!"));
        assert_eq!(result_mark(&api_error("no_math_found")), Some("!"));
    }

    #[test]
    fn key_problems_open_settings_and_say_which_problem_it_is() {
        let rejected = SnipResult::Failed(Failure::Api(ApiError::Server {
            status: 401,
            code: "invalid_key".into(),
            resets_at: None,
        }));
        let missing = SnipResult::Failed(Failure::NoAccessKey);
        assert!(needs_access_key(&rejected));
        assert!(needs_access_key(&missing));
        assert!(!needs_access_key(&api_error("no_math_found")));
        assert_eq!(
            notification_for(&rejected).unwrap().0,
            "Access key not accepted"
        );
        assert_eq!(
            notification_for(&missing).unwrap().0,
            "Snip needs your access key"
        );
    }

    #[test]
    fn permission_message_points_to_settings() {
        let (title, body) = notification_for(&SnipResult::NeedsPermission).unwrap();
        assert!(title.contains("Screen Recording"));
        assert!(body.contains("Screen Recording"));
        // A grant only takes effect after a relaunch, so the message must say so.
        assert!(body.contains("Restart Snip"));
    }
}
