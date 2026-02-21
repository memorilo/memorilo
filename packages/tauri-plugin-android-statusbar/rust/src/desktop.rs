use serde::de::DeserializeOwned;
use tauri::{plugin::PluginApi, AppHandle, Runtime};

use crate::Result;

pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> Result<StatusBar<R>> {
    Ok(StatusBar(std::marker::PhantomData))
}

pub struct StatusBar<R: Runtime>(std::marker::PhantomData<R>);

impl<R: Runtime> StatusBar<R> {
    pub fn set_fullscreen(
        &self,
        _fullscreen: bool,
        _status_bar_color: Option<String>,
    ) -> Result<()> {
        Ok(())
    }
}
