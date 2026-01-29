pub mod lru_cache;

pub fn client_id() -> String {
    let system = std::env::consts::OS;
    let arch = std::env::consts::ARCH;
    let app_version = env!("CARGO_PKG_VERSION");
    let machine_name = tauri_plugin_os::hostname();
    let current_username = std::env::var("USER")
        .or_else(|_| std::env::var("USERNAME"))
        .unwrap_or_else(|_| "unknown".to_string());

    format!("{system}_{arch}/{app_version}({machine_name},{current_username})")
}
