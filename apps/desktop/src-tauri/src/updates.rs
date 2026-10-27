//! Auto-update (docs/beta-v1.md §13): checks `latest.json` on the website, installs a newer
//! version in the background, and lets the user restart into it from the menu. Nothing
//! restarts without the user choosing to.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, PoisonError};
use std::time::Duration;

use tauri::menu::MenuItem;
use tauri::{AppHandle, Manager, Wry};
use tauri_plugin_updater::UpdaterExt;

const FIRST_CHECK_DELAY: Duration = Duration::from_secs(30);
const CHECK_INTERVAL: Duration = Duration::from_secs(24 * 60 * 60);

pub const MENU_ID: &str = "updates";
pub const CHECK_LABEL: &str = "Check for Updates…";

pub struct UpdateState {
    /// The menu item that checks for updates, or restarts once one is installed.
    item: MenuItem<Wry>,
    /// Version installed and waiting for a restart.
    ready: Mutex<Option<String>>,
    checking: AtomicBool,
}

impl UpdateState {
    pub fn new(item: MenuItem<Wry>) -> Self {
        Self {
            item,
            ready: Mutex::new(None),
            checking: AtomicBool::new(false),
        }
    }

    fn ready_version(&self) -> Option<String> {
        self.ready
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }
}

/// The menu item's label for a given state.
pub fn menu_label(ready: Option<&str>) -> String {
    match ready {
        Some(version) => format!("Restart to Update to {version}"),
        None => CHECK_LABEL.into(),
    }
}

/// Checks shortly after launch and then daily. Debug builds only check on request, so
/// development never installs a release over itself.
pub fn start_background_checks(app: &AppHandle) {
    if cfg!(debug_assertions) {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(FIRST_CHECK_DELAY);
        loop {
            check(&app, false);
            std::thread::sleep(CHECK_INTERVAL);
        }
    });
}

/// The menu item: restart into an installed update, or check now.
pub fn on_menu_click(app: &AppHandle) {
    if app.state::<UpdateState>().ready_version().is_some() {
        app.restart();
    }
    check(app, true);
}

/// The notification title once an update is installed and waiting for a restart.
pub fn ready_title(version: &str) -> String {
    format!("Snip {version} is ready to install")
}

/// Runs one check off the main thread. `manual` checks report "up to date" and failures;
/// background checks stay quiet unless an update is ready.
fn check(app: &AppHandle, manual: bool) {
    let state = app.state::<UpdateState>();
    if state.ready_version().is_some() || state.checking.swap(true, Ordering::SeqCst) {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let outcome = check_and_install(&app).await;
        let state = app.state::<UpdateState>();
        state.checking.store(false, Ordering::SeqCst);
        match outcome {
            Ok(Some(version)) => {
                log::info!("update {version} installed; waiting for a restart");
                if let Err(error) = state.item.set_text(menu_label(Some(&version))) {
                    log::warn!("could not update the menu: {error}");
                }
                let title = ready_title(&version);
                *state.ready.lock().unwrap_or_else(PoisonError::into_inner) = Some(version);
                crate::notify(
                    &app,
                    &title,
                    "Choose Restart to Update from the ∫ menu when convenient.",
                );
            }
            Ok(None) if manual => {
                crate::notify(&app, "Snip is up to date", "");
            }
            Ok(None) => {}
            Err(error) => {
                log::warn!("update check failed: {error}");
                if manual {
                    crate::notify(
                        &app,
                        "Couldn't check for updates",
                        "Check your internet connection and try again.",
                    );
                }
            }
        }
    });
}

/// Returns the installed version, or None when already up to date. The plugin verifies the
/// archive's signature against the public key in tauri.conf.json before installing.
async fn check_and_install(app: &AppHandle) -> Result<Option<String>, tauri_plugin_updater::Error> {
    let Some(update) = app.updater()?.check().await? else {
        return Ok(None);
    };
    let version = update.version.clone();
    log::info!("downloading update {version}");
    update.download_and_install(|_, _| {}, || {}).await?;
    Ok(Some(version))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn menu_label_offers_a_check_until_an_update_is_installed() {
        assert_eq!(menu_label(None), "Check for Updates…");
        assert_eq!(menu_label(Some("0.5.2")), "Restart to Update to 0.5.2");
    }

    #[test]
    fn ready_notification_names_the_version() {
        assert_eq!(ready_title("0.5.4"), "Snip 0.5.4 is ready to install");
    }
}
