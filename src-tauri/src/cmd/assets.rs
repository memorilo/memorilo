use crate::db::{self, DbState};
use crate::error::Result;
use crate::utils::asset_url::path_to_tauri_asset_url;
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, State};
use tokio::fs::{self, File, OpenOptions};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use uuid::Uuid;

const COPY_BUFFER_SIZE: usize = 8 * 1024;

async fn get_or_create_assets_dir(app: &AppHandle) -> Result<PathBuf> {
    let assets_dir = app.path().app_local_data_dir()?.join("assets");
    fs::create_dir_all(&assets_dir).await?;
    Ok(assets_dir)
}

async fn write_bytes_with_sha256(bytes: &[u8], dest: &Path) -> Result<String> {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    let hash = hasher.finalize();

    let mut dest_file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(dest)
        .await?;
    dest_file.write_all(bytes).await?;
    dest_file.flush().await?;

    Ok(format!("{:x}", hash))
}

async fn create_asset_from_bytes(
    app: &AppHandle,
    db_state: &State<'_, DbState>,
    bytes: &[u8],
    extension: Option<String>,
    meta: Option<String>,
) -> Result<db::Asset> {
    let assets_dir = get_or_create_assets_dir(app).await?;
    let asset_id = Uuid::now_v7().to_string();
    let filename = match extension.as_deref() {
        Some(ext) if !ext.trim().is_empty() => {
            format!("{asset_id}.{}", ext.trim().trim_start_matches('.'))
        }
        _ => asset_id.clone(),
    };
    let dest_path = assets_dir.join(&filename);

    let sha256 = match write_bytes_with_sha256(bytes, &dest_path).await {
        Ok(value) => value,
        Err(err) => {
            let _ = fs::remove_file(&dest_path).await;
            return Err(err);
        }
    };

    let asset_result = (|| -> Result<db::Asset> {
        let conn = db_state.conn.lock()?;
        db::create_asset_record(&conn, &asset_id, &filename, &sha256, meta.as_deref())?;
        db::get_asset_by_id(&conn, &asset_id)?
            .ok_or_else(|| "Asset record missing".to_string().into())
    })();

    match asset_result {
        Ok(asset) => Ok(asset),
        Err(err) => {
            let _ = fs::remove_file(&dest_path).await;
            Err(err)
        }
    }
}

async fn copy_with_sha256(source: &Path, dest: &Path) -> Result<String> {
    let mut source_file = File::open(source).await?;
    let mut dest_file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(dest)
        .await?;

    let mut hasher = Sha256::new();
    let mut buffer = [0u8; COPY_BUFFER_SIZE];

    loop {
        let read_bytes = source_file.read(&mut buffer).await?;
        if read_bytes == 0 {
            break;
        }
        hasher.update(&buffer[..read_bytes]);
        dest_file.write_all(&buffer[..read_bytes]).await?;
    }

    dest_file.flush().await?;

    let hash = hasher.finalize();
    Ok(format!("{:x}", hash))
}

#[tauri::command]
#[specta::specta]
pub async fn add_asset(
    app: AppHandle,
    db_state: State<'_, DbState>,
    source_path: String,
    meta: Option<String>,
) -> Result<db::Asset> {
    let source_path = PathBuf::from(source_path);
    let metadata = fs::metadata(&source_path).await?;
    if !metadata.is_file() {
        return Err("Source path is not a file".to_string().into());
    }

    let assets_dir = get_or_create_assets_dir(&app).await?;

    let asset_id = Uuid::now_v7().to_string();
    let filename = match source_path
        .extension()
        .and_then(|ext| ext.to_str())
        .filter(|ext| !ext.is_empty())
    {
        Some(ext) => format!("{asset_id}.{ext}"),
        None => asset_id.clone(),
    };
    let dest_path = assets_dir.join(&filename);

    let sha256 = match copy_with_sha256(&source_path, &dest_path).await {
        Ok(value) => value,
        Err(err) => {
            let _ = fs::remove_file(&dest_path).await;
            return Err(err);
        }
    };

    let asset_result = (|| -> Result<db::Asset> {
        let conn = db_state.conn.lock()?;
        db::create_asset_record(&conn, &asset_id, &filename, &sha256, meta.as_deref())?;
        db::get_asset_by_id(&conn, &asset_id)?
            .ok_or_else(|| "Asset record missing".to_string().into())
    })();

    match asset_result {
        Ok(asset) => Ok(asset),
        Err(err) => {
            let _ = fs::remove_file(&dest_path).await;
            Err(err)
        }
    }
}

#[tauri::command]
#[specta::specta]
pub async fn add_asset_from_bytes(
    app: AppHandle,
    db_state: State<'_, DbState>,
    bytes: Vec<u8>,
    extension: Option<String>,
    meta: Option<String>,
) -> Result<db::Asset> {
    create_asset_from_bytes(&app, &db_state, &bytes, extension, meta).await
}

#[tauri::command]
#[specta::specta]
pub async fn add_asset_from_base64(
    app: AppHandle,
    db_state: State<'_, DbState>,
    base64: String,
    extension: Option<String>,
    meta: Option<String>,
) -> Result<db::Asset> {
    let payload = base64.split_once(',').map(|(_, data)| data).unwrap_or(&base64);
    let bytes = BASE64_STANDARD
        .decode(payload)
        .map_err(|err| err.to_string())?;
    create_asset_from_bytes(&app, &db_state, &bytes, extension, meta).await
}

#[derive(Debug, Clone, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AssetDeleteResult {
    pub deleted_record: bool,
    pub deleted_files: Vec<String>,
}

#[tauri::command]
#[specta::specta]
pub async fn delete_asset(
    app: AppHandle,
    db_state: State<'_, DbState>,
    asset_id: String,
) -> Result<AssetDeleteResult> {
    let (filename, deleted_record) = {
        let conn = db_state.conn.lock()?;
        let filename = db::get_asset_by_id(&conn, &asset_id)?.map(|asset| asset.filename);
        let affected = conn.execute("DELETE FROM assets WHERE asset_id = ?1", [&asset_id])?;
        (filename, affected > 0)
    };

    let assets_dir = get_or_create_assets_dir(&app).await?;

    let mut deleted_files = Vec::new();

    if let Some(filename) = filename {
        let path = assets_dir.join(&filename);
        if fs::try_exists(&path).await? {
            fs::remove_file(&path).await?;
            deleted_files.push(filename);
        }
    } else if fs::try_exists(&assets_dir).await? {
        let prefix = format!("{asset_id}.");
        let mut dir = fs::read_dir(&assets_dir).await?;
        while let Some(entry) = dir.next_entry().await? {
            let file_type = entry.file_type().await?;
            if !file_type.is_file() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            if name == asset_id || name.starts_with(&prefix) {
                let path = entry.path();
                fs::remove_file(&path).await?;
                deleted_files.push(name);
            }
        }
    }

    Ok(AssetDeleteResult {
        deleted_record,
        deleted_files,
    })
}

#[derive(Debug, Clone, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AssetAnalysisEntry {
    pub asset_id: String,
    pub filename: String,
}

#[derive(Debug, Clone, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AssetAnalysisResult {
    pub missing_files: Vec<AssetAnalysisEntry>,
    pub untracked_files: Vec<AssetAnalysisEntry>,
}

#[tauri::command]
#[specta::specta]
pub async fn analyze_assets(
    app: AppHandle,
    db_state: State<'_, DbState>,
) -> Result<AssetAnalysisResult> {
    let db_refs = {
        let conn = db_state.conn.lock()?;
        db::list_asset_refs(&conn)?
    };
    let db_map: std::collections::HashMap<String, String> = db_refs
        .into_iter()
        .map(|(asset_id, filename)| (filename, asset_id))
        .collect();
    let db_set: HashSet<String> = db_map.keys().cloned().collect();

    let assets_dir = get_or_create_assets_dir(&app).await?;

    let mut fs_set: HashSet<String> = HashSet::new();
    if fs::try_exists(&assets_dir).await? {
        let mut dir = fs::read_dir(&assets_dir).await?;
        while let Some(entry) = dir.next_entry().await? {
            let file_type = entry.file_type().await?;
            if !file_type.is_file() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            if name.is_empty() {
                continue;
            }
            fs_set.insert(name);
        }
    }

    let mut missing_files: Vec<AssetAnalysisEntry> = db_set
        .difference(&fs_set)
        .filter_map(|filename| {
            db_map.get(filename).map(|asset_id| AssetAnalysisEntry {
                asset_id: asset_id.clone(),
                filename: filename.clone(),
            })
        })
        .collect();
    let mut untracked_files: Vec<AssetAnalysisEntry> = fs_set
        .difference(&db_set)
        .map(|filename| AssetAnalysisEntry {
            asset_id: parse_asset_id_from_filename(filename),
            filename: filename.clone(),
        })
        .collect();

    missing_files.sort_by(|a, b| a.filename.cmp(&b.filename));
    untracked_files.sort_by(|a, b| a.filename.cmp(&b.filename));

    Ok(AssetAnalysisResult {
        missing_files,
        untracked_files,
    })
}

#[tauri::command]
#[specta::specta]
pub async fn get_asset_url(
    app: AppHandle,
    db_state: State<'_, DbState>,
    asset_id: String,
    use_https: Option<bool>,
) -> Result<String> {
    let filename = {
        let conn = db_state.conn.lock()?;
        db::get_asset_by_id(&conn, &asset_id)?
            .ok_or_else(|| "Asset not found".to_string())?
            .filename
    };

    let assets_dir = get_or_create_assets_dir(&app).await?;
    let path = assets_dir.join(filename);
    Ok(path_to_tauri_asset_url(&path, use_https)?.to_string())
}

fn parse_asset_id_from_filename(filename: &str) -> String {
    filename
        .split_once('.')
        .map(|(head, _)| head.to_string())
        .unwrap_or_else(|| filename.to_string())
}
