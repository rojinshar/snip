//! Snip menu-bar app. M1: hotkey → native region capture → PNG saved, with notifications.
//! Recognition and the clipboard arrive in M3 (see docs/desktop-v0.md).

mod capture;
mod permissions;

use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Instant;

use capture::{capture_region, png_dimensions, CaptureOutcome};
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use tauri_plugin_notification::NotificationExt;

/// Default hotkey ⌘⇧2 (decision in docs/desktop-v0.md §13). Configurable in M5.
fn snip_shortcut() -> Shortcut {
    Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::Digit2)
}

/// Prevents a second capture from starting while one is in progress.
#[derive(Default)]
struct SnipState {
    busy: AtomicBool,
}

/// What one snip attempt ended in.
#[derive(Debug, PartialEq)]
enum SnipResult {
    NeedsPermission,
    Cancelled,
    Captured {
        path: PathBuf,
        width: u32,
        height: u32,
        millis: u128,
    },
    Failed(String),
}

pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() == ShortcutState::Pressed && *shortcut == snip_shortcut() {
                        start_snip(app.clone());
                    }
                })
                .build(),
        )
        .manage(SnipState::default())
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
    let quit = MenuItem::with_id(app, "quit", "Quit Snip", true, Some("CmdOrCtrl+Q"))?;
    let menu = Menu::with_items(app, &[&snip, &PredefinedMenuItem::separator(app)?, &quit])?;

    TrayIconBuilder::with_id("main")
        .icon(Image::from_bytes(include_bytes!(
            "../icons/tray-template.png"
        ))?)
        .icon_as_template(true)
        .tooltip("Snip")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "snip" => start_snip(app.clone()),
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
    // screencapture blocks until the user finishes, so keep it off the main thread.
    std::thread::spawn(move || {
        let result = run_snip(&app);
        log::info!("snip result: {result:?}");
        if result == SnipResult::NeedsPermission {
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
        Err(error) => return SnipResult::Failed(format!("no cache directory: {error}")),
    };

    let started = Instant::now();
    match capture_region(&dir) {
        Ok(CaptureOutcome::Cancelled) => SnipResult::Cancelled,
        Ok(CaptureOutcome::Captured(path)) => {
            let millis = started.elapsed().as_millis();
            match fs::read(&path).ok().as_deref().and_then(png_dimensions) {
                Some((width, height)) => SnipResult::Captured {
                    path,
                    width,
                    height,
                    millis,
                },
                None => SnipResult::Failed(format!("{} is not a valid PNG", path.display())),
            }
        }
        Err(error) => SnipResult::Failed(error.to_string()),
    }
}

/// The notification to show for a result, or None to stay silent (cancel).
fn notification_for(result: &SnipResult) -> Option<(String, String)> {
    match result {
        SnipResult::Cancelled => None,
        SnipResult::NeedsPermission => Some((
            "Snip needs Screen Recording access".into(),
            "Enable Snip in System Settings → Privacy & Security → Screen Recording, then try again."
                .into(),
        )),
        SnipResult::Captured { width, height, .. } => {
            Some(("Captured".into(), format!("{width}×{height} region saved.")))
        }
        SnipResult::Failed(_) => Some(("Snip failed".into(), "Something went wrong. Try again.".into())),
    }
}

fn notify(app: &AppHandle, title: &str, body: &str) {
    if let Err(error) = app.notification().builder().title(title).body(body).show() {
        log::warn!("notification failed: {error}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cancel_is_silent() {
        assert_eq!(notification_for(&SnipResult::Cancelled), None);
    }

    #[test]
    fn capture_reports_dimensions() {
        let result = SnipResult::Captured {
            path: PathBuf::from("/tmp/a.png"),
            width: 640,
            height: 120,
            millis: 900,
        };
        assert_eq!(
            notification_for(&result),
            Some(("Captured".into(), "640×120 region saved.".into()))
        );
    }

    #[test]
    fn permission_and_failure_explain_themselves() {
        let (title, body) = notification_for(&SnipResult::NeedsPermission).unwrap();
        assert!(title.contains("Screen Recording"));
        assert!(body.contains("System Settings"));
        // Internal error details stay in the log, not the notification.
        let (_, body) = notification_for(&SnipResult::Failed("disk full at /x".into())).unwrap();
        assert!(!body.contains("/x"));
    }

    #[test]
    fn shortcut_is_cmd_shift_2() {
        assert_eq!(
            snip_shortcut(),
            Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::Digit2)
        );
    }
}
