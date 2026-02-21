use tauri::{command, AppHandle, Runtime, State};

use crate::{Result, StatusBar};

#[command]
pub async fn set_fullscreen<R: Runtime>(
    _app: AppHandle<R>,
    statusbar: State<'_, StatusBar<R>>,
    fullscreen: bool,
    status_bar_color: Option<String>,
) -> Result<()> {
    statusbar.set_fullscreen(fullscreen, status_bar_color)
}
