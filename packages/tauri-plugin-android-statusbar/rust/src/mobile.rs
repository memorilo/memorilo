use serde::de::DeserializeOwned;
use serde::Serialize;
use tauri::{
    plugin::{PluginApi, PluginHandle},
    AppHandle, Runtime,
};

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "app.tauri.android.statusbar";

pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> crate::Result<StatusBar<R>> {
    #[cfg(target_os = "android")]
    {
        let handle = api.register_android_plugin(PLUGIN_IDENTIFIER, "AndroidStatusbarPlugin")?;
        return Ok(StatusBar(handle));
    }

    #[cfg(not(target_os = "android"))]
    {
        let _ = api;
        Err(crate::Error::StatusBar(
            "Android status bar plugin is only available on Android".to_string(),
        ))
    }
}

/// Access to the Android status bar APIs.
pub struct StatusBar<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> StatusBar<R> {
    pub fn set_fullscreen(
        &self,
        fullscreen: bool,
        status_bar_color: Option<String>,
    ) -> crate::Result<()> {
        self.0
            .run_mobile_plugin(
                "setFullscreen",
                SetFullscreenArgs {
                    fullscreen,
                    status_bar_color,
                },
            )
            .map_err(Into::into)
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SetFullscreenArgs {
    fullscreen: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    status_bar_color: Option<String>,
}
