//! Auto-update (docs/beta-v1.md §13): checks `latest.json` on the website and downloads a
//! newer version in the background. The download is installed only when the user chooses
//! Restart to Update, or quits Snip. Nothing restarts without the user choosing to.
//!
//! Installing while the old version keeps running would replace the app's files under it,
//! and macOS then drops the running app's notifications (its on-disk identity no longer
//! matches), so the install waits.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::Duration;

use tauri::menu::MenuItem;
use tauri::{AppHandle, Manager, Wry};
use tauri_plugin_updater::{Update, UpdaterExt};

const FIRST_CHECK_DELAY: Duration = Duration::from_secs(30);
const CHECK_INTERVAL: Duration = Duration::from_secs(24 * 60 * 60);

pub const MENU_ID: &str = "updates";
pub const CHECK_LABEL: &str = "Check for Updates…";

/// A verified download waiting to be installed.
struct Pending {
    update: Update,
    bytes: Vec<u8>,
}

pub struct UpdateState {
    /// The menu item that checks for updates, or restarts once one is downloaded.
    item: MenuItem<Wry>,
    pending: Mutex<Option<Pending>>,
    checking: AtomicBool,
}

impl UpdateState {
    pub fn new(item: MenuItem<Wry>) -> Self {
        Self {
            item,
            pending: Mutex::new(None),
            checking: AtomicBool::new(false),
        }
    }

    fn pending(&self) -> MutexGuard<'_, Option<Pending>> {
        self.pending.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

/// The menu item's label for a given state.
pub fn menu_label(ready: Option<&str>) -> String {
    match ready {
        Some(version) => format!("Restart to Update to {version}"),
        None => CHECK_LABEL.into(),
    }
}

/// The notification title once an update is downloaded and waiting.
pub fn ready_title(version: &str) -> String {
    format!("Snip {version} is ready to install")
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

/// The menu item: install the downloaded update and restart into it, or check now.
pub fn on_menu_click(app: &AppHandle) {
    if app.state::<UpdateState>().pending().is_some() {
        if install_pending(app) {
            app.restart();
        }
        crate::notify(
            app,
            "Couldn't install the update",
            "Snip will try again at the next check.",
        );
        return;
    }
    check(app, true);
}

/// Installs a downloaded update, if there is one. Called before restarting and when Snip
/// quits, so a downloaded update is never lost. Returns whether an update was installed.
pub fn install_pending(app: &AppHandle) -> bool {
    let state = app.state::<UpdateState>();
    let Some(pending) = state.pending().take() else {
        return false;
    };
    match pending.update.install(&pending.bytes) {
        Ok(()) => {
            log::info!("installed update {}", pending.update.version);
            true
        }
        Err(error) => {
            log::error!(
                "could not install update {}: {error}",
                pending.update.version
            );
            if let Err(error) = state.item.set_text(CHECK_LABEL) {
                log::warn!("could not update the menu: {error}");
            }
            false
        }
    }
}

/// Runs one check off the main thread. `manual` checks report "up to date" and failures;
/// background checks stay quiet unless an update is ready.
fn check(app: &AppHandle, manual: bool) {
    let state = app.state::<UpdateState>();
    if state.pending().is_some() || state.checking.swap(true, Ordering::SeqCst) {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let outcome = check_and_download(&app).await;
        let state = app.state::<UpdateState>();
        state.checking.store(false, Ordering::SeqCst);
        match outcome {
            Ok(Some(pending)) => {
                let version = pending.update.version.clone();
                log::info!("update {version} downloaded; waiting for Restart to Update");
                *state.pending() = Some(pending);
                if let Err(error) = state.item.set_text(menu_label(Some(&version))) {
                    log::warn!("could not update the menu: {error}");
                }
                crate::notify(
                    &app,
                    &ready_title(&version),
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

/// Returns the downloaded update, or None when already up to date. The plugin verifies the
/// archive's signature against the public key in tauri.conf.json while downloading.
async fn check_and_download(
    app: &AppHandle,
) -> Result<Option<Pending>, tauri_plugin_updater::Error> {
    let Some(update) = app.updater()?.check().await? else {
        return Ok(None);
    };
    log::info!("downloading update {}", update.version);
    let bytes = update.download(|_, _| {}, || {}).await?;
    Ok(Some(Pending { update, bytes }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn menu_label_offers_a_check_until_an_update_is_downloaded() {
        assert_eq!(menu_label(None), "Check for Updates…");
        assert_eq!(menu_label(Some("0.5.2")), "Restart to Update to 0.5.2");
    }

    #[test]
    fn ready_notification_names_the_version() {
        assert_eq!(ready_title("0.5.4"), "Snip 0.5.4 is ready to install");
    }
}
