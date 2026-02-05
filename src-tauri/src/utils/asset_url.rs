use crate::error::Result;
use dunce::simplified;
use percent_encoding::{utf8_percent_encode, NON_ALPHANUMERIC};
use std::path::Path;
use tauri::Url;

/// Converts a file path to a URL that can be loaded by the webview.
///
/// Based on tauri-apps/tauri#14786 (convertFileSrc URL construction).
pub fn path_to_tauri_asset_url(path: &Path, use_https: Option<bool>) -> Result<Url> {
    let protocol = "asset";
    let path = simplified(path);
    let encoded = utf8_percent_encode(&path.to_string_lossy(), NON_ALPHANUMERIC).to_string();

    #[cfg(windows)]
    {
        let scheme = if use_https.unwrap_or(false) { "https" } else { "http" };
        Url::parse(&format!("{scheme}://{protocol}.localhost/{encoded}"))
            .map_err(|err| err.to_string().into())
    }
    #[cfg(not(windows))]
    {
        let _ = use_https;
        Url::parse(&format!("{protocol}://localhost/{encoded}"))
            .map_err(|err| err.to_string().into())
    }
}
