const COMMANDS: &[&str] = &["set_fullscreen"];

fn main() {
    let result = tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .try_build();

    // When building documentation for Android the plugin build result is always Err() and is irrelevant
    if !(cfg!(docsrs) && std::env::var("TARGET").unwrap_or_default().contains("android")) {
        result.unwrap();
    }
}
