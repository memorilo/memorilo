use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::HashMap;
use tauri::AppHandle;
use tauri_specta::Event;

#[derive(Clone, Serialize, Deserialize, Type)]
pub enum ToastType {
    Info,
    Success,
    Warning,
    Error,
}

#[derive(Clone, Serialize, Deserialize, Type, Event)]
pub struct ToastEvent {
    pub toast_type: ToastType,
    pub ns: String,
    pub i18n_key: String,
    pub values: HashMap<String, String>,
}

pub fn show_toast(app_handle: &AppHandle, toast: ToastEvent) {
    if let Err(err) = toast.emit(app_handle) {
        log::error!("Failed to emit toast event: {err}");
    }
}
