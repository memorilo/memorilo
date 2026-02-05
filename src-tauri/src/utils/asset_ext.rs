pub fn extension_from_content_type(content_type: Option<&str>) -> Option<String> {
    // Prefer an extension derived from the HTTP response `content-type`.
    // This is more reliable than URL suffixes and avoids maintaining our own mapping table.
    content_type
        .and_then(mime2ext::mime2ext)
        .map(|ext| ext.to_string())
}

pub fn extension_from_url(url: &reqwest::Url) -> Option<String> {
    // Fall back to the URL path suffix (e.g. ".../image.png") when content-type is missing.
    let mut segments = url.path_segments()?;
    let filename = segments.next_back()?;
    let (head, ext) = filename.rsplit_once('.')?;
    if head.is_empty() || ext.is_empty() {
        return None;
    }

    let ext = ext.trim().to_ascii_lowercase();
    if ext.chars().all(|ch| ch.is_ascii_alphanumeric()) {
        Some(ext)
    } else {
        None
    }
}

pub fn extension_from_magic(bytes: &[u8]) -> Option<String> {
    // Last resort: detect well-known image formats from their magic bytes.
    if bytes.starts_with(&[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]) {
        return Some("png".to_string());
    }
    if bytes.len() >= 3 && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF {
        return Some("jpg".to_string());
    }
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        return Some("gif".to_string());
    }
    if bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" {
        return Some("webp".to_string());
    }
    None
}

pub fn infer_image_extension(
    url: &reqwest::Url,
    content_type: Option<&str>,
    bytes: &[u8],
) -> Option<String> {
    // Order matters:
    // - content-type tends to be correct for CDNs / signed URLs
    // - URL suffix is cheap and often correct
    // - magic bytes is most robust but requires enough bytes in memory (we already have them here)
    extension_from_content_type(content_type)
        .or_else(|| extension_from_url(url))
        .or_else(|| extension_from_magic(bytes))
}
