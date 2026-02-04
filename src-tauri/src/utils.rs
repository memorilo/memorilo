pub mod lru_cache;
pub mod asset_url;

static CLIENT_ID: once_cell::sync::Lazy<String> = once_cell::sync::Lazy::new(|| {
    let system = std::env::consts::OS;
    let arch = std::env::consts::ARCH;
    // let app_version = env!("CARGO_PKG_VERSION");
    let machine_name = tauri_plugin_os::hostname();
    let current_username = std::env::var("USER")
        .or_else(|_| std::env::var("USERNAME"))
        .unwrap_or_else(|_| "unknown".to_string());

    format!("{system}_{arch}({machine_name},{current_username})")
});

pub fn client_id() -> String {
    CLIENT_ID.clone()
}
