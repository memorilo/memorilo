use crate::db::{self, DbState};
use crate::error::Result;
use crate::utils::asset_ext::infer_image_extension;
use crate::utils::asset_url::path_to_tauri_asset_url;
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use reqwest::header::CONTENT_TYPE;
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
    log::debug!("assets: ensure dir: {}", assets_dir.display());
    fs::create_dir_all(&assets_dir).await?;
    Ok(assets_dir)
}

async fn write_bytes_with_sha256(bytes: &[u8], dest: &Path) -> Result<String> {
    log::debug!(
        "assets: write bytes: dest={} bytes={}",
        dest.display(),
        bytes.len()
    );
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
    log::info!(
        "assets: create from bytes start (bytes: {} ext: {:?} meta_len: {})",
        bytes.len(),
        extension.as_deref(),
        meta.as_ref().map(|m| m.len()).unwrap_or(0),
    );
    let assets_dir = get_or_create_assets_dir(app).await?;
    let asset_id = Uuid::now_v7().to_string();
    let filename = match extension.as_deref() {
        Some(ext) if !ext.trim().is_empty() => {
            format!("{asset_id}.{}", ext.trim().trim_start_matches('.'))
        }
        _ => asset_id.clone(),
    };
    let dest_path = assets_dir.join(&filename);
    log::debug!(
        "assets: create from bytes dest prepared: asset_id={} filename={} path={}",
        asset_id,
        filename,
        dest_path.display()
    );

    let sha256 = match write_bytes_with_sha256(bytes, &dest_path).await {
        Ok(value) => value,
        Err(err) => {
            log::error!(
                "assets: create from bytes write failed: asset_id={} filename={} err={}",
                asset_id,
                filename,
                err
            );
            let _ = fs::remove_file(&dest_path).await;
            return Err(err);
        }
    };
    log::debug!(
        "assets: create from bytes wrote file: asset_id={} filename={} sha256={}",
        asset_id,
        filename,
        sha256
    );

    let asset_result = (|| -> Result<db::Asset> {
        let conn = db_state.conn.lock()?;
        db::create_asset_record(&conn, &asset_id, &filename, &sha256, meta.as_deref())?;
        db::get_asset_by_id(&conn, &asset_id)?
            .ok_or_else(|| "Asset record missing".to_string().into())
    })();

    match asset_result {
        Ok(asset) => {
            log::info!(
                "assets: create from bytes ok asset_id={} filename={} sha256={}",
                asset.asset_id,
                asset.filename,
                asset.sha256
            );
            Ok(asset)
        }
        Err(err) => {
            log::error!(
                "assets: create from bytes db failed: asset_id={} filename={} err={}",
                asset_id,
                filename,
                err
            );
            let _ = fs::remove_file(&dest_path).await;
            Err(err)
        }
    }
}

async fn copy_with_sha256(source: &Path, dest: &Path) -> Result<String> {
    log::debug!(
        "assets: copy file start: src={} dest={}",
        source.display(),
        dest.display()
    );
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
    log::info!(
        "assets: add_asset request: src={} meta_len={}",
        source_path.display(),
        meta.as_ref().map(|m| m.len()).unwrap_or(0)
    );
    let metadata = fs::metadata(&source_path).await?;
    if !metadata.is_file() {
        log::warn!(
            "assets: add_asset rejected (not a file): src={}",
            source_path.display()
        );
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
    log::debug!(
        "assets: add_asset dest prepared: asset_id={} filename={} path={} size={}",
        asset_id,
        filename,
        dest_path.display(),
        metadata.len()
    );

    let sha256 = match copy_with_sha256(&source_path, &dest_path).await {
        Ok(value) => value,
        Err(err) => {
            log::error!(
                "assets: add_asset copy failed: asset_id={} filename={} err={}",
                asset_id,
                filename,
                err
            );
            let _ = fs::remove_file(&dest_path).await;
            return Err(err);
        }
    };
    log::debug!(
        "assets: add_asset copied file: asset_id={} filename={} sha256={}",
        asset_id,
        filename,
        sha256
    );

    let asset_result = (|| -> Result<db::Asset> {
        let conn = db_state.conn.lock()?;
        db::create_asset_record(&conn, &asset_id, &filename, &sha256, meta.as_deref())?;
        db::get_asset_by_id(&conn, &asset_id)?
            .ok_or_else(|| "Asset record missing".to_string().into())
    })();

    match asset_result {
        Ok(asset) => {
            log::info!(
                "assets: add_asset ok asset_id={} filename={} sha256={}",
                asset.asset_id,
                asset.filename,
                asset.sha256
            );
            Ok(asset)
        }
        Err(err) => {
            log::error!(
                "assets: add_asset db failed: asset_id={} filename={} err={}",
                asset_id,
                filename,
                err
            );
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
    log::info!(
        "assets: add_asset_from_bytes request (bytes: {} ext: {:?} meta_len: {})",
        bytes.len(),
        extension.as_deref(),
        meta.as_ref().map(|m| m.len()).unwrap_or(0)
    );
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
    log::info!(
        "assets: add_asset_from_base64 request (base64_len: {} ext: {:?} meta_len: {})",
        base64.len(),
        extension.as_deref(),
        meta.as_ref().map(|m| m.len()).unwrap_or(0)
    );
    let payload = base64.split_once(',').map(|(_, data)| data).unwrap_or(&base64);
    let bytes = BASE64_STANDARD
        .decode(payload)
        .map_err(|err| {
            log::warn!("assets: add_asset_from_base64 decode failed: {err}");
            err.to_string()
        })?;
    log::debug!(
        "assets: add_asset_from_base64 decoded bytes: {}",
        bytes.len()
    );
    create_asset_from_bytes(&app, &db_state, &bytes, extension, meta).await
}

#[tauri::command]
#[specta::specta]
pub async fn add_asset_from_url(
    app: AppHandle,
    db_state: State<'_, DbState>,
    url: String,
) -> Result<db::Asset> {
    // Downloading in the WebView can fail due to CORS restrictions. By downloading
    // in Rust, we can always store the bytes and then serve them via the asset protocol.
    log::info!("assets: add_asset_from_url request: url={}", url);

    let parsed = reqwest::Url::parse(&url).map_err(|err| {
        log::warn!("assets: add_asset_from_url invalid url: url={} err={}", url, err);
        err.to_string()
    })?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        log::warn!(
            "assets: add_asset_from_url rejected (unsupported scheme): url={} scheme={}",
            url,
            parsed.scheme()
        );
        return Err("Only http/https URLs are supported".to_string().into());
    }

    let res = reqwest::get(parsed).await.map_err(|err| {
        log::warn!("assets: add_asset_from_url fetch failed: url={} err={}", url, err);
        err.to_string()
    })?;

    let status = res.status();
    let response_url = res.url().clone();
    let content_type = res
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.to_string());

    if !status.is_success() {
        log::warn!(
            "assets: add_asset_from_url rejected (http status): url={} status={} content_type={:?}",
            url,
            status,
            content_type.as_deref()
        );
        return Err(format!("Failed to download asset: HTTP {}", status).into());
    }

    let bytes = res.bytes().await.map_err(|err| {
        log::warn!("assets: add_asset_from_url read failed: url={} err={}", url, err);
        err.to_string()
    })?;

    // Keep a reasonable filename extension for better OS preview / debugging.
    // We infer it from (content-type -> url suffix -> magic bytes).
    let extension = infer_image_extension(&response_url, content_type.as_deref(), bytes.as_ref());
    log::debug!(
        "assets: add_asset_from_url fetched: url={} final_url={} bytes={} content_type={:?} ext={:?}",
        url,
        response_url,
        bytes.len(),
        content_type.as_deref(),
        extension.as_deref()
    );

    // Store where the asset comes from for later inspection.
    let meta = serde_json::json!({
        "source": "url",
        "url": url,
        "contentType": content_type
    })
    .to_string();

    create_asset_from_bytes(&app, &db_state, bytes.as_ref(), extension, Some(meta)).await
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
    log::info!("assets: delete_asset request: asset_id={asset_id}");
    let (filename, deleted_record) = {
        let conn = db_state.conn.lock()?;
        let filename = db::get_asset_by_id(&conn, &asset_id)?.map(|asset| asset.filename);
        let affected = conn.execute("DELETE FROM assets WHERE asset_id = ?1", [&asset_id])?;
        (filename, affected > 0)
    };
    if !deleted_record {
        log::warn!("assets: delete_asset record not found: asset_id={asset_id}");
    }

    let assets_dir = get_or_create_assets_dir(&app).await?;

    let mut deleted_files = Vec::new();

    if let Some(filename) = filename {
        let path = assets_dir.join(&filename);
        if fs::try_exists(&path).await? {
            fs::remove_file(&path).await?;
            deleted_files.push(filename);
        } else {
            log::warn!(
                "assets: delete_asset file missing: asset_id={} path={}",
                asset_id,
                path.display()
            );
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

    log::info!(
        "assets: delete_asset ok asset_id={} deleted_record={} deleted_files={}",
        asset_id,
        deleted_record,
        deleted_files.len()
    );
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
    pub unused_files: Vec<AssetAnalysisEntry>,
}

#[tauri::command]
#[specta::specta]
pub async fn analyze_assets(
    app: AppHandle,
    db_state: State<'_, DbState>,
) -> Result<AssetAnalysisResult> {
    log::info!("assets: analyze_assets start");
    let (db_refs, used_asset_ids) = {
        let conn = db_state.conn.lock()?;
        let db_refs = db::list_asset_refs(&conn)?;

        let mut used_asset_ids: HashSet<String> = HashSet::new();
        let mut stmt = conn.prepare("SELECT attr FROM doc_nodes WHERE attr LIKE '%\"assetId\"%'")?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        for row in rows {
            let attr = row?;
            match serde_json::from_str::<serde_json::Value>(&attr) {
                Ok(value) => {
                    if let Some(asset_id) = value.get("assetId").and_then(|v| v.as_str()) {
                        used_asset_ids.insert(asset_id.to_string());
                    }
                }
                Err(err) => {
                    log::warn!(
                        "assets: analyze_assets ignore invalid doc_nodes.attr json: err={}",
                        err
                    );
                }
            }
        }

        (db_refs, used_asset_ids)
    };

    let db_map: std::collections::HashMap<String, String> = db_refs
        .iter()
        .cloned()
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

    let missing_asset_ids: HashSet<String> =
        missing_files.iter().map(|entry| entry.asset_id.clone()).collect();
    let mut unused_files: Vec<AssetAnalysisEntry> = db_refs
        .into_iter()
        .filter(|(asset_id, _)| !missing_asset_ids.contains(asset_id))
        .filter(|(asset_id, _)| !used_asset_ids.contains(asset_id))
        .map(|(asset_id, filename)| AssetAnalysisEntry { asset_id, filename })
        .collect();

    missing_files.sort_by(|a, b| a.filename.cmp(&b.filename));
    untracked_files.sort_by(|a, b| a.filename.cmp(&b.filename));
    unused_files.sort_by(|a, b| a.filename.cmp(&b.filename));

    log::info!(
        "assets: analyze_assets ok missing_files={} untracked_files={} unused_files={}",
        missing_files.len(),
        untracked_files.len(),
        unused_files.len()
    );
    Ok(AssetAnalysisResult {
        missing_files,
        untracked_files,
        unused_files,
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
    log::debug!("assets: get_asset_url request: asset_id={asset_id}");
    let filename = {
        let conn = db_state.conn.lock()?;
        db::get_asset_by_id(&conn, &asset_id)?
            .ok_or_else(|| {
                log::warn!("assets: get_asset_url not found: asset_id={asset_id}");
                "Asset not found".to_string()
            })?
            .filename
    };

    let assets_dir = get_or_create_assets_dir(&app).await?;
    let path = assets_dir.join(filename);
    if !fs::try_exists(&path).await? {
        log::warn!(
            "assets: get_asset_url file missing: asset_id={} path={}",
            asset_id,
            path.display()
        );
        return Err("Asset file missing".to_string().into());
    }
    let url = path_to_tauri_asset_url(&path, use_https)?.to_string();
    log::debug!(
        "assets: get_asset_url ok asset_id={} path={} url={}",
        asset_id,
        path.display(),
        url
    );
    Ok(url)
}

fn parse_asset_id_from_filename(filename: &str) -> String {
    filename
        .split_once('.')
        .map(|(head, _)| head.to_string())
        .unwrap_or_else(|| filename.to_string())
}
