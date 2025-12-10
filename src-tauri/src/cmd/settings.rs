use std::path::PathBuf;

use crate::error::Result;


#[derive(Default)]
pub struct SettingsState {
  pub path: tokio::sync::Mutex<PathBuf>,
  pub value: tokio::sync::RwLock<Option<serde_json::Value>>
}

#[tauri::command]
#[specta::specta]
pub async fn read_settings(settings_state: tauri::State<'_, SettingsState>) -> Result<String> {
    let mut value_guard = settings_state.value.write().await;
    if value_guard.is_none() {
        let path_guard = settings_state.path.lock().await;
        if path_guard.exists() {
            let content = tokio::fs::read_to_string(&*path_guard).await?;
            let toml_value: toml::Value = toml::from_str(&content)?;
            let json_value: serde_json::Value = serde_json::to_value(toml_value)?;
            *value_guard = Some(json_value);
        } else {
            *value_guard = Some(serde_json::json!({}));
        }
    }
    
    let json_str = serde_json::to_string(&value_guard.as_ref().unwrap())?;
    Ok(json_str)
}

#[tauri::command]
#[specta::specta]
pub async fn update_settings(settings_state: tauri::State<'_, SettingsState>, content: String) -> Result<()> {
    let val: serde_json::Value = serde_json::from_str(&content)?;
    let mut value_guard = settings_state.value.write().await;
    *value_guard = Some(val);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn save_settings(settings_state: tauri::State<'_, SettingsState>) -> Result<()> {
    let value_guard = settings_state.value.read().await;
    if let Some(val) = &*value_guard {
        let toml_str = toml::to_string(val)?;
        let path_guard = settings_state.path.lock().await;
        tokio::fs::write(&*path_guard, toml_str).await?;
    }
    Ok(())
}
