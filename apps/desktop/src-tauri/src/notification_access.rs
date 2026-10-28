//! Notification permission, through Apple's UserNotifications framework. The notification
//! plugin can show notifications but can't ask for permission or report it on macOS, so a
//! tester who dismissed or denied the system's request silently got no "Copied to clipboard".
//! The first-run window uses this to ask up front and to notice when notifications are off.

use std::sync::mpsc;
use std::time::Duration;

use block2::RcBlock;
use objc2::runtime::Bool;
use objc2_foundation::NSError;
use objc2_user_notifications::{
    UNAlertStyle, UNAuthorizationOptions, UNAuthorizationStatus, UNNotificationSettings,
    UNUserNotificationCenter,
};
use serde::Serialize;
use std::ptr::NonNull;

/// How long to wait for macOS to answer. Asking waits for the user, so it gets longer.
const STATUS_TIMEOUT: Duration = Duration::from_secs(5);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(120);

/// Opens System Settings at Notifications, on Snip's own page.
pub const SETTINGS_URL: &str =
    "x-apple.systempreferences:com.apple.Notifications-Settings.extension?id=com.rojinsharma.snip";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum NotificationAccess {
    /// macOS hasn't asked yet.
    NotAsked,
    /// Allowed, and shown as banners or alerts.
    On,
    /// Denied, or allowed with the alert style set to None: nothing would appear.
    Off,
    /// Not a bundled app (`tauri dev`), where the framework is unusable.
    Unavailable,
}

/// Maps the framework's answer to what the first-run window needs to know.
pub fn classify(status: UNAuthorizationStatus, alert_style: UNAlertStyle) -> NotificationAccess {
    match status {
        UNAuthorizationStatus::NotDetermined => NotificationAccess::NotAsked,
        UNAuthorizationStatus::Denied => NotificationAccess::Off,
        _ if alert_style == UNAlertStyle::None => NotificationAccess::Off,
        _ => NotificationAccess::On,
    }
}

/// The current permission. Blocks for up to a few seconds; call it off the main thread.
pub fn status() -> NotificationAccess {
    let Some(center) = center() else {
        return NotificationAccess::Unavailable;
    };
    let (tx, rx) = mpsc::channel();
    let handler = RcBlock::new(move |settings: NonNull<UNNotificationSettings>| {
        // SAFETY: macOS passes a valid settings object for the duration of the call.
        let settings = unsafe { settings.as_ref() };
        let _ = tx.send(classify(
            settings.authorizationStatus(),
            settings.alertStyle(),
        ));
    });
    center.getNotificationSettingsWithCompletionHandler(&handler);
    rx.recv_timeout(STATUS_TIMEOUT).unwrap_or_else(|_| {
        log::warn!("macOS did not report the notification permission in time");
        NotificationAccess::NotAsked
    })
}

/// Shows macOS's permission request if it hasn't been answered, then returns the result.
/// Once answered, macOS never asks again; the user changes it in System Settings.
pub fn request() -> NotificationAccess {
    let Some(center) = center() else {
        return NotificationAccess::Unavailable;
    };
    let (tx, rx) = mpsc::channel();
    let handler = RcBlock::new(move |_granted: Bool, error: *mut NSError| {
        if !error.is_null() {
            // SAFETY: a non-null error is a valid NSError for the duration of the call.
            let error = unsafe { &*error };
            log::warn!("notification permission request failed: {error}");
        }
        let _ = tx.send(());
    });
    center.requestAuthorizationWithOptions_completionHandler(
        UNAuthorizationOptions::Alert | UNAuthorizationOptions::Sound,
        &handler,
    );
    if rx.recv_timeout(REQUEST_TIMEOUT).is_err() {
        log::warn!("no answer to the notification permission request");
    }
    status()
}

/// The notification center, or None outside an app bundle: there the framework raises an
/// Objective-C exception ("bundleProxyForCurrentProcess is nil") that would abort Snip.
fn center() -> Option<objc2::rc::Retained<UNUserNotificationCenter>> {
    let exe = std::env::current_exe().ok()?;
    if !exe.to_string_lossy().contains(".app/Contents/MacOS/") {
        return None;
    }
    Some(UNUserNotificationCenter::currentNotificationCenter())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allowed_banners_and_alerts_count_as_on() {
        for style in [UNAlertStyle::Banner, UNAlertStyle::Alert] {
            for status in [
                UNAuthorizationStatus::Authorized,
                UNAuthorizationStatus::Provisional,
            ] {
                assert_eq!(classify(status, style), NotificationAccess::On);
            }
        }
    }

    #[test]
    fn denied_or_silent_counts_as_off() {
        assert_eq!(
            classify(UNAuthorizationStatus::Denied, UNAlertStyle::Banner),
            NotificationAccess::Off
        );
        // Allowed, but with the alert style set to None nothing appears on screen.
        assert_eq!(
            classify(UNAuthorizationStatus::Authorized, UNAlertStyle::None),
            NotificationAccess::Off
        );
    }

    #[test]
    fn unanswered_is_not_asked() {
        assert_eq!(
            classify(UNAuthorizationStatus::NotDetermined, UNAlertStyle::None),
            NotificationAccess::NotAsked
        );
    }

    #[test]
    fn outside_an_app_bundle_it_is_unavailable_instead_of_crashing() {
        // Test binaries never run from an .app bundle.
        assert_eq!(status(), NotificationAccess::Unavailable);
        assert_eq!(request(), NotificationAccess::Unavailable);
    }
}
