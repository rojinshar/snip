//! The first-run window: welcome, then notifications, then Screen Recording, then a restart
//! so Screen Recording takes effect, then "You're all set". Shown on first launch, and to
//! existing users who are missing a permission. UI: ui/welcome.html.

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use serde::Serialize;

use crate::notifications::{self, NotificationAccess};
use crate::permissions;
use crate::settings::SetupState;
use crate::settings_window::SettingsState;

pub const WINDOW_LABEL: &str = "welcome";

/// What to do about the first-run window when Snip launches.
#[derive(Debug, PartialEq, Eq)]
pub enum OnLaunch {
    Open,
    /// Everything is already allowed (someone who used Snip before this window existed).
    MarkDone,
    Nothing,
}

pub fn on_launch(
    setup: SetupState,
    screen_recording: bool,
    notifications: NotificationAccess,
) -> OnLaunch {
    let notifications_fine = matches!(
        notifications,
        NotificationAccess::On | NotificationAccess::Unavailable
    );
    match setup {
        SetupState::Done => OnLaunch::Nothing,
        // Back from the restart: the window shows how it went.
        SetupState::AwaitingRestart => OnLaunch::Open,
        SetupState::Pending if screen_recording && notifications_fine => OnLaunch::MarkDone,
        SetupState::Pending => OnLaunch::Open,
    }
}

/// Decides on a background thread, since reading the notification permission waits on macOS.
pub fn start(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        let setup = app.state::<SettingsState>().current().setup;
        if setup == SetupState::Done {
            return;
        }
        match on_launch(
            setup,
            permissions::has_screen_recording_access(),
            notifications::status(),
        ) {
            OnLaunch::Open => open(&app),
            OnLaunch::MarkDone => set_setup(&app, SetupState::Done),
            OnLaunch::Nothing => {}
        }
    });
}

/// Opens the window, or focuses it if it is already open.
pub fn open(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
        let _ = window.set_focus();
        return;
    }
    let built =
        WebviewWindowBuilder::new(app, WINDOW_LABEL, WebviewUrl::App("welcome.html".into()))
            .title("Welcome to Snip")
            .inner_size(460.0, 440.0)
            .resizable(false)
            .maximizable(false)
            .minimizable(false)
            .center()
            .build();
    match built {
        Ok(window) => {
            let _ = window.set_focus();
        }
        Err(error) => log::error!("could not open the welcome window: {error}"),
    }
}

fn set_setup(app: &AppHandle, setup: SetupState) {
    if let Err(error) = app
        .state::<SettingsState>()
        .update(|settings| settings.setup = setup)
    {
        log::warn!("could not save setup progress: {error}");
    }
}

/// Closing the window is "skip": Snip still asks for a missing permission on the first snip.
pub fn on_close_requested(app: &AppHandle) {
    set_setup(app, SetupState::Done);
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupStatus {
    notifications: NotificationAccess,
    screen_recording: bool,
    hotkey: String,
}

#[tauri::command]
pub async fn get_setup_status(app: AppHandle) -> SetupStatus {
    let notifications = blocking(notifications::status).await;
    SetupStatus {
        notifications,
        screen_recording: permissions::has_screen_recording_access(),
        hotkey: app.state::<SettingsState>().current().hotkey,
    }
}

/// Shows macOS's notification request (first time only) and returns the outcome.
#[tauri::command]
pub async fn request_notifications() -> NotificationAccess {
    blocking(notifications::request).await
}

#[tauri::command]
pub fn open_notification_settings() {
    open_url(notifications::SETTINGS_URL);
}

/// Puts Snip in the Screen Recording list (macOS's own prompt, first time only) and opens
/// that list. Remembers to reopen this window after the relaunch the permission needs,
/// including when the user picks macOS's own "Quit & Reopen".
#[tauri::command]
pub fn request_screen_recording(app: AppHandle) -> bool {
    if permissions::has_screen_recording_access() {
        return true;
    }
    set_setup(&app, SetupState::AwaitingRestart);
    if permissions::request_screen_recording_access() {
        return true;
    }
    open_url(permissions::SCREEN_RECORDING_SETTINGS_URL);
    false
}

#[tauri::command]
pub fn restart_snip(app: AppHandle) {
    crate::updates::install_pending(&app);
    app.restart();
}

#[tauri::command]
pub fn finish_setup(app: AppHandle) {
    set_setup(&app, SetupState::Done);
    if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
        let _ = window.destroy();
    }
}

fn open_url(url: &str) {
    if let Err(error) = std::process::Command::new("open").arg(url).status() {
        log::warn!("could not open {url}: {error}");
    }
}

async fn blocking(work: fn() -> NotificationAccess) -> NotificationAccess {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .unwrap_or(NotificationAccess::Unavailable)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_new_install_opens_the_window() {
        assert_eq!(
            on_launch(SetupState::Pending, false, NotificationAccess::NotAsked),
            OnLaunch::Open
        );
    }

    #[test]
    fn an_existing_user_missing_a_permission_sees_it_once() {
        // The tester whose notifications were off.
        assert_eq!(
            on_launch(SetupState::Pending, true, NotificationAccess::Off),
            OnLaunch::Open
        );
        assert_eq!(
            on_launch(SetupState::Pending, false, NotificationAccess::On),
            OnLaunch::Open
        );
    }

    #[test]
    fn an_existing_user_with_everything_allowed_never_sees_it() {
        assert_eq!(
            on_launch(SetupState::Pending, true, NotificationAccess::On),
            OnLaunch::MarkDone
        );
        // Development builds can't read the notification permission.
        assert_eq!(
            on_launch(SetupState::Pending, true, NotificationAccess::Unavailable),
            OnLaunch::MarkDone
        );
    }

    #[test]
    fn it_reopens_after_the_screen_recording_restart_and_never_after_done() {
        assert_eq!(
            on_launch(SetupState::AwaitingRestart, true, NotificationAccess::On),
            OnLaunch::Open
        );
        assert_eq!(
            on_launch(SetupState::Done, false, NotificationAccess::Off),
            OnLaunch::Nothing
        );
    }
}
