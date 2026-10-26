//! Screen Recording permission. Without it, macOS captures only the wallpaper and our own
//! windows, so a capture "succeeds" but contains no equation.

#[cfg(target_os = "macos")]
#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGPreflightScreenCaptureAccess() -> bool;
    fn CGRequestScreenCaptureAccess() -> bool;
}

/// Whether the app may capture other apps' windows. Never prompts.
pub fn has_screen_recording_access() -> bool {
    #[cfg(target_os = "macos")]
    // SAFETY: a CoreGraphics function with no arguments and no preconditions.
    unsafe {
        CGPreflightScreenCaptureAccess()
    }
    #[cfg(not(target_os = "macos"))]
    true
}

/// Asks macOS for access. Shows the system prompt the first time only; afterwards the user
/// must enable it in System Settings. Returns whether access is granted now.
pub fn request_screen_recording_access() -> bool {
    #[cfg(target_os = "macos")]
    // SAFETY: as above.
    unsafe {
        CGRequestScreenCaptureAccess()
    }
    #[cfg(not(target_os = "macos"))]
    true
}

/// Opens System Settings at Privacy & Security, Screen Recording.
pub const SCREEN_RECORDING_SETTINGS_URL: &str =
    "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture";
