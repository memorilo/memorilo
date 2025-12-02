use tauri_specta::collect_commands;

pub fn get_specta_builder() -> tauri_specta::Builder {
    let builder = tauri_specta::Builder::<tauri::Wry>::new()
        .commands(collect_commands![
            crate::cmd::get_root_folder_uuid,
            crate::cmd::is_folder_node_exist,
            crate::cmd::get_folder_node,
            crate::cmd::get_folder_node_children,
            crate::cmd::create_folder_node,
            crate::cmd::rename_folder_node,
            crate::cmd::delete_folder_node_ret_parent,
            crate::cmd::get_parent_folder_node_uuid,
        ]);

    #[cfg(debug_assertions)]
    builder
        .export(specta_typescript::Typescript::default().header("// @ts-nocheck"), "../packages/api/src/native/bindings.gen.ts")
        .expect("Failed to export typescript bindings");

    builder
}