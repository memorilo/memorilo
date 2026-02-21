use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

#[cfg(desktop)]
mod desktop;
#[cfg(mobile)]
mod mobile;

mod commands;
mod error;

pub use error::{Error, Result};
#[cfg(desktop)]
pub use desktop::StatusBar;
#[cfg(mobile)]
pub use mobile::StatusBar;

/// Extensions to access the status bar APIs.
pub trait StatusBarExt<R: Runtime> {
    fn status_bar(&self) -> &StatusBar<R>;
}

impl<R: Runtime, T: Manager<R>> StatusBarExt<R> for T {
    fn status_bar(&self) -> &StatusBar<R> {
        self.state::<StatusBar<R>>().inner()
    }
}

/// Initializes the plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("android-statusbar")
        .invoke_handler(tauri::generate_handler![commands::set_fullscreen])
        .setup(|app, api| {
            #[cfg(mobile)]
            let statusbar = mobile::init(app, api)?;
            #[cfg(desktop)]
            let statusbar = desktop::init(app, api)?;
            app.manage(statusbar);
            Ok(())
        })
        .build()
}
