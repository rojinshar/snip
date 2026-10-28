//! Notifications, through Apple's UserNotifications framework: showing them, asking for
//! permission, and reading it.
//!
//! Everything goes through this one framework on purpose. The notification plugin uses the
//! older NSUserNotificationCenter, and once an app has talked to UserNotifications, macOS
//! refuses that older channel for it ("usernoted: Denying message … LegacyConnection"):
//! 0.7.1 asked for permission here but still showed notifications through the plugin, and
//! every notification silently disappeared.

use std::ptr::NonNull;
use std::sync::mpsc;
use std::sync::Once;
use std::time::Duration;

use block2::{DynBlock, RcBlock};
use objc2::rc::Retained;
use objc2::runtime::{Bool, NSObject, ProtocolObject};
use objc2::{define_class, msg_send, AllocAnyThread};
use objc2_foundation::{NSError, NSObjectProtocol, NSString, NSUUID};
use objc2_user_notifications::{
    UNAlertStyle, UNAuthorizationOptions, UNAuthorizationStatus, UNMutableNotificationContent,
    UNNotification, UNNotificationPresentationOptions, UNNotificationRequest,
    UNNotificationSettings, UNUserNotificationCenter, UNUserNotificationCenterDelegate,
};
use serde::Serialize;

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
    /// Not a bundled app (`tauri dev`, tests), where the framework is unusable.
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
        log_error("notification permission request failed", error);
        let _ = tx.send(());
    });
    center.requestAuthorizationWithOptions_completionHandler(options(), &handler);
    if rx.recv_timeout(REQUEST_TIMEOUT).is_err() {
        log::warn!("no answer to the notification permission request");
    }
    status()
}

/// Shows a notification; an empty body shows the title alone. Returns false when the
/// framework is unavailable (development builds), so the caller can fall back.
///
/// Doesn't block. The permission request comes first: it is instant once answered, and
/// someone who skipped the first-run window is asked here, on their first notification.
pub fn show(title: &str, body: &str) -> bool {
    let Some(center) = center() else {
        return false;
    };
    install_delegate(&center);

    let content = UNMutableNotificationContent::new();
    content.setTitle(&NSString::from_str(title));
    if !body.is_empty() {
        content.setBody(&NSString::from_str(body));
    }
    let request = UNNotificationRequest::requestWithIdentifier_content_trigger(
        &NSUUID::new().UUIDString(),
        &content,
        None,
    );

    let deliver_to = center.clone();
    let handler = RcBlock::new(move |granted: Bool, error: *mut NSError| {
        log_error("notification permission request failed", error);
        if !granted.as_bool() {
            log::info!("notifications are off for Snip; not shown");
            return;
        }
        let added = RcBlock::new(|error: *mut NSError| {
            log_error("could not show a notification", error);
        });
        deliver_to.addNotificationRequest_withCompletionHandler(&request, Some(&added));
    });
    center.requestAuthorizationWithOptions_completionHandler(options(), &handler);
    true
}

fn options() -> UNAuthorizationOptions {
    UNAuthorizationOptions::Alert | UNAuthorizationOptions::Sound
}

define_class!(
    // SAFETY: NSObject has no subclassing requirements, and this class has no Drop.
    #[unsafe(super(NSObject))]
    #[name = "SnipNotificationDelegate"]
    struct Delegate;

    unsafe impl NSObjectProtocol for Delegate {}

    unsafe impl UNUserNotificationCenterDelegate for Delegate {
        /// Without this, macOS hides banners while Snip is the active app (its Settings or
        /// first-run window is focused). A snip's confirmation should always show.
        #[unsafe(method(userNotificationCenter:willPresentNotification:withCompletionHandler:))]
        fn will_present(
            &self,
            _center: &UNUserNotificationCenter,
            _notification: &UNNotification,
            completion_handler: &DynBlock<dyn Fn(UNNotificationPresentationOptions)>,
        ) {
            completion_handler.call((UNNotificationPresentationOptions::Banner
                | UNNotificationPresentationOptions::List
                | UNNotificationPresentationOptions::Sound,));
        }
    }
);

/// Sets the delegate once. The center only keeps a weak reference, so the delegate is leaked
/// on purpose: it must live as long as Snip.
fn install_delegate(center: &UNUserNotificationCenter) {
    static INSTALLED: Once = Once::new();
    INSTALLED.call_once(|| {
        // SAFETY: plain allocation and init of an NSObject subclass with no ivars.
        let delegate: Retained<Delegate> = unsafe { msg_send![Delegate::alloc(), init] };
        center.setDelegate(Some(ProtocolObject::from_ref(&*delegate)));
        std::mem::forget(delegate);
    });
}

fn log_error(context: &str, error: *mut NSError) {
    if !error.is_null() {
        // SAFETY: a non-null error is a valid NSError for the duration of the callback.
        let error = unsafe { &*error };
        log::warn!("{context}: {error}");
    }
}

/// The notification center, or None outside an app bundle: there the framework raises an
/// Objective-C exception ("bundleProxyForCurrentProcess is nil") that would abort Snip.
fn center() -> Option<Retained<UNUserNotificationCenter>> {
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
        assert!(!show("Copied to clipboard", ""));
    }
}
