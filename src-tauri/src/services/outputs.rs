use crate::{types::Settings, AppState};
use serde::Serialize;
use std::{
    path::{Path, PathBuf},
    sync::Arc,
    time::UNIX_EPOCH,
};
use tauri::{Manager, State};
use tauri_plugin_opener::OpenerExt;

pub fn validate_override(value: &str) -> Result<String, String> {
    let value = value.trim();
    if value.is_empty() {
        return Ok(String::new());
    }
    let path = Path::new(value);
    if !path.is_absolute() || !path.is_dir() {
        return Err("请选择已存在的图像输出目录，需使用绝对路径".into());
    }
    Ok(value.to_string())
}

fn directory(settings: &Settings) -> Result<PathBuf, String> {
    if !settings.output_dir.trim().is_empty() {
        return Ok(PathBuf::from(&settings.output_dir));
    }
    let root = if settings.comfy_root.is_empty() {
        super::workspace::legacy_root(&settings.lora_dir).unwrap_or_default()
    } else {
        settings.comfy_root.clone()
    };
    if root.is_empty() {
        return Err("请先绑定 ComfyUI 或在设置中指定图像输出目录".into());
    }
    Ok(Path::new(&root).join("output"))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputImage {
    path: String,
    name: String,
    modified: u64,
    size: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputImages {
    directory: String,
    exists: bool,
    total: usize,
    items: Vec<OutputImage>,
}

fn scan(path: &Path, page: usize) -> Result<OutputImages, String> {
    let mut result = OutputImages {
        directory: path.to_string_lossy().into(),
        exists: false,
        total: 0,
        items: vec![],
    };
    match std::fs::metadata(path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(result),
        Err(e) => return Err(format!("无法读取输出目录：{e}")),
        Ok(meta) if !meta.is_dir() => return Err("输出位置不是文件夹，请在设置中重新选择".into()),
        Ok(_) => result.exists = true,
    }
    let root = path.canonicalize().map_err(|e| e.to_string())?;
    let mut images = vec![];
    for entry in walkdir::WalkDir::new(&root).follow_links(false) {
        let entry = entry.map_err(|e| format!("无法读取输出目录：{e}"))?;
        if !entry.file_type().is_file() {
            continue;
        }
        let ext = entry
            .path()
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if !matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "webp") {
            continue;
        }
        let canonical = entry.path().canonicalize().map_err(|e| e.to_string())?;
        if !canonical.starts_with(&root) {
            continue;
        }
        let meta = entry.metadata().map_err(|e| e.to_string())?;
        images.push(OutputImage {
            name: entry
                .path()
                .strip_prefix(&root)
                .unwrap_or(entry.path())
                .to_string_lossy()
                .into(),
            path: canonical.to_string_lossy().into(),
            modified: meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|t| t.as_millis() as u64)
                .unwrap_or(0),
            size: meta.len(),
        });
    }
    images.sort_by(|a, b| {
        b.modified
            .cmp(&a.modified)
            .then_with(|| a.name.cmp(&b.name))
    });
    result.total = images.len();
    result.items = images
        .into_iter()
        .skip(page.saturating_mul(60))
        .take(60)
        .collect();
    Ok(result)
}

#[tauri::command]
pub async fn list_output_images(
    app: tauri::AppHandle,
    state: State<'_, Arc<AppState>>,
    page: usize,
) -> Result<OutputImages, String> {
    let path = directory(&state.db.settings())?;
    let result = tauri::async_runtime::spawn_blocking(move || scan(&path, page))
        .await
        .map_err(|e| e.to_string())??;
    for item in &result.items {
        app.asset_protocol_scope()
            .allow_file(&item.path)
            .map_err(|e| e.to_string())?;
    }
    Ok(result)
}

#[tauri::command]
pub async fn output_image_metadata(
    state: State<'_, Arc<AppState>>,
    path: String,
) -> Result<super::output_metadata::ImageMetadata, String> {
    let root = directory(&state.db.settings())?;
    tauri::async_runtime::spawn_blocking(move || {
        let path = checked_image_path(&root, Path::new(&path))?;
        super::output_metadata::read(&path)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn checked_image_path(root: &Path, path: &Path) -> Result<PathBuf, String> {
    let root = root
        .canonicalize()
        .map_err(|e| format!("输出目录无法访问：{e}"))?;
    let path = path
        .canonicalize()
        .map_err(|e| format!("图片无法访问：{e}"))?;
    let ext = path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !path.starts_with(root)
        || !path.is_file()
        || !matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "webp")
    {
        return Err("只能读取当前输出目录中的图片信息".into());
    }
    Ok(path)
}

#[tauri::command]
pub fn open_output_directory(
    app: tauri::AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let path = directory(&state.db.settings())?;
    if !path.is_dir() {
        return Err("输出目录尚不存在，请生成图片后刷新，或在设置中选择其他目录".into());
    }
    app.opener()
        .open_path(path.to_string_lossy(), None::<&str>)
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn metadata_path_must_be_an_image_inside_current_directory() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("output");
        std::fs::create_dir(&root).unwrap();
        let inside = root.join("a.png");
        let outside = dir.path().join("a.png");
        let other = root.join("secret.txt");
        for path in [&inside, &outside, &other] {
            std::fs::write(path, "test").unwrap();
        }
        assert!(checked_image_path(&root, &inside).is_ok());
        assert!(checked_image_path(&root, &outside).is_err());
        assert!(checked_image_path(&root, &root.join("../a.png")).is_err());
        assert!(checked_image_path(&root, &other).is_err());
    }
    #[test]
    fn defaults_and_custom_directory_are_independent() {
        let dir = tempfile::tempdir().unwrap();
        let mut settings = Settings {
            comfy_root: dir.path().to_string_lossy().into(),
            ..Settings::default()
        };
        assert_eq!(directory(&settings).unwrap(), dir.path().join("output"));
        settings.output_dir = validate_override(dir.path().to_str().unwrap()).unwrap();
        settings.comfy_root.clear();
        assert_eq!(directory(&settings).unwrap(), dir.path());
        assert!(validate_override("relative/path").is_err());
        assert!(validate_override(dir.path().join("missing").to_str().unwrap()).is_err());
    }
    #[test]
    fn scans_nested_images_with_pagination_and_missing_directory() {
        let dir = tempfile::tempdir().unwrap();
        let nested = dir.path().join("nested");
        assert!(!scan(&nested, 0).unwrap().exists);
        std::fs::create_dir(&nested).unwrap();
        for i in 0..65 {
            std::fs::write(nested.join(format!("{i:03}.PNG")), "image").unwrap();
        }
        std::fs::write(nested.join("workflow.json"), "{}").unwrap();
        let result = scan(dir.path(), 0).unwrap();
        assert_eq!(result.total, 65);
        assert_eq!(result.items.len(), 60);
        assert!(result.items[0].name.starts_with("nested"));
        assert_eq!(scan(dir.path(), 1).unwrap().items.len(), 5);
    }
}
