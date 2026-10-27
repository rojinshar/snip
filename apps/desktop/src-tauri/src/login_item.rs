//! Open at login, through macOS login items (`SMAppService`): Snip appears in System
//! Settings → General → Login Items like any other app, where the user can also turn it off.

use objc2_service_management::{SMAppService, SMAppServiceStatus};

/// Whether Snip is set to open at login.
pub fn is_enabled() -> bool {
    // SAFETY: plain ServiceManagement calls with no arguments to uphold.
    unsafe { SMAppService::mainAppService().status() == SMAppServiceStatus::Enabled }
}

pub fn set_enabled(enabled: bool) -> Result<(), String> {
    // SAFETY: as above; errors come back as NSError, not exceptions.
    let service = unsafe { SMAppService::mainAppService() };
    let result = if enabled {
        unsafe { service.registerAndReturnError() }
    } else {
        unsafe { service.unregisterAndReturnError() }
    };
    result.map_err(|error| error.localizedDescription().to_string())
}
