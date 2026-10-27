//! The settings window and the commands it calls (docs/desktop-v0.md §14).

use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard, PoisonError};

use tauri::menu::MenuItem;
use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder, Wry};
use tauri_plugin_global_shortcut::GlobalShortcutExt;

use crate::access_key;
use crate::format::Delimiters;
use crate::settings::{self, parse_hotkey, Settings};

pub const WINDOW_LABEL: &str = "settings";

pub struct SettingsState {
    path: PathBuf,
    current: Mutex<Settings>,
    /// The tray's Snip Equation item, whose shortcut label follows the hotkey.
    snip_item: MenuItem<Wry>,
}

impl SettingsState {
    pub fn new(path: PathBuf, current: Settings, snip_item: MenuItem<Wry>) -> Self {
        Self {
            path,
            current: Mutex::new(current),
            snip_item,
        }
    }

    pub fn current(&self) -> Settings {
        self.lock().clone()
    }

    fn lock(&self) -> MutexGuard<'_, Settings> {
        self.current.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

/// Opens the settings window, or focuses it if it is already open.
pub fn open(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
        let _ = window.set_focus();
        return;
    }
    let built = WebviewWindowBuilder::new(app, WINDOW_LABEL, WebviewUrl::default())
        .title("Snip Settings")
        .inner_size(440.0, 500.0)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .center()
        .build();
    match built {
        Ok(window) => {
            let _ = window.set_focus();
        }
        Err(error) => log::error!("could not open settings: {error}"),
    }
}

/// Registers the saved hotkey unless it is already registered.
pub fn register_current_hotkey(app: &AppHandle) -> Result<(), String> {
    let hotkey = app.state::<SettingsState>().current().hotkey;
    let shortcut = parse_hotkey(&hotkey).map_err(|error| error.message().to_string())?;
    let shortcuts = app.global_shortcut();
    if shortcuts.is_registered(shortcut) {
        return Ok(());
    }
    shortcuts.register(shortcut).map_err(|error| {
        log::error!("could not register {hotkey}: {error}");
        TAKEN.to_string()
    })
}

const TAKEN: &str = "Another app is using that hotkey. Try a different one.";

#[tauri::command]
pub fn get_settings(state: State<'_, SettingsState>) -> Settings {
    state.current()
}

/// Switches to a new hotkey. The new one is registered and saved before the old one is
/// released, so a failure at any step leaves the old hotkey working.
#[tauri::command]
pub fn set_hotkey(
    app: AppHandle,
    state: State<'_, SettingsState>,
    hotkey: String,
) -> Result<Settings, String> {
    let new = parse_hotkey(&hotkey).map_err(|error| error.message().to_string())?;
    let mut current = state.lock();
    let old = parse_hotkey(&current.hotkey).ok();
    let shortcuts = app.global_shortcut();

    if old != Some(new) {
        shortcuts.register(new).map_err(|error| {
            log::warn!("could not register {hotkey}: {error}");
            TAKEN.to_string()
        })?;
    }
    let next = Settings {
        hotkey: hotkey.clone(),
        ..current.clone()
    };
    if let Err(error) = settings::save(&state.path, &next) {
        if old != Some(new) {
            let _ = shortcuts.unregister(new);
        }
        return Err(save_failed(error));
    }
    if let Some(old) = old.filter(|old| *old != new) {
        let _ = shortcuts.unregister(old);
    }
    if let Err(error) = state.snip_item.set_accelerator(Some(&hotkey)) {
        log::warn!("could not update the menu shortcut label: {error}");
    }
    *current = next.clone();
    Ok(next)
}

#[tauri::command]
pub fn set_delimiters(
    state: State<'_, SettingsState>,
    delimiters: Delimiters,
) -> Result<Settings, String> {
    let mut current = state.lock();
    let next = Settings {
        delimiters,
        ..current.clone()
    };
    settings::save(&state.path, &next).map_err(save_failed)?;
    *current = next.clone();
    Ok(next)
}

/// Called while the hotkey field is recording, so pressing the current hotkey records it
/// instead of starting a snip.
#[tauri::command]
pub fn pause_hotkey(app: AppHandle) -> Result<(), String> {
    app.global_shortcut()
        .unregister_all()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn resume_hotkey(app: AppHandle) -> Result<(), String> {
    register_current_hotkey(&app)
}

/// What Settings shows for the saved key (`snip_…k3q7`), never the key itself.
#[tauri::command]
pub fn get_access_key_hint(app: AppHandle) -> Option<String> {
    access_key::load(&access_key_path(&app).ok()?).map(|key| access_key::hint(&key))
}

#[tauri::command]
pub fn set_access_key(app: AppHandle, key: String) -> Result<String, String> {
    let key = access_key::normalize(&key).map_err(|error| error.message().to_string())?;
    access_key::save(&access_key_path(&app)?, &key).map_err(|error| {
        log::error!("could not save the access key: {error:?}");
        error.message().to_string()
    })?;
    Ok(access_key::hint(&key))
}

#[tauri::command]
pub fn clear_access_key(app: AppHandle) -> Result<(), String> {
    access_key::delete(&access_key_path(&app)?).map_err(|error| {
        log::error!("could not remove the access key: {error:?}");
        error.message().to_string()
    })
}

pub fn access_key_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|dir| access_key::path_in(&dir))
        .map_err(|error| {
            log::error!("no app config directory: {error}");
            "Couldn't save the key. Try again.".into()
        })
}

fn save_failed(error: std::io::Error) -> String {
    log::error!("could not save settings: {error}");
    "Couldn't save settings. Try again.".into()
}
