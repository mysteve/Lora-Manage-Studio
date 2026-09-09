use std::path::{Path, PathBuf};

/// Resolve either the application root or the enclosing Windows portable folder.
/// Only inspect files; never start ComfyUI or contact a running server.
pub fn resolve_root(value: &str) -> Result<PathBuf, String> {
    let path = Path::new(value.trim());
    if value.trim().is_empty() || !path.is_absolute() {
        return Err("请选择 ComfyUI 根目录的绝对路径".into());
    }
    let root = if path.join("main.py").is_file() {
        path.to_path_buf()
    } else if path.join("ComfyUI/main.py").is_file() {
        path.join("ComfyUI")
    } else {
        return Err("此目录没有找到 ComfyUI。请选择包含 main.py 的根目录，或包含 ComfyUI 子目录的便携版文件夹".into());
    };
    root.canonicalize()
        .map_err(|_| "ComfyUI 根目录无法访问".into())
}

pub fn bind(value: &str) -> Result<(String, String), String> {
    let root = resolve_root(value)?;
    let loras = root.join("models/loras");
    std::fs::create_dir_all(&loras).map_err(|e| format!("无法创建 LoRA 模型目录：{e}"))?;
    Ok((display_path(&root), display_path(&loras)))
}

fn display_path(path: &Path) -> String {
    let value = path.to_string_lossy();
    if let Some(rest) = value.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{rest}")
    } else {
        value.strip_prefix(r"\\?\").unwrap_or(&value).to_string()
    }
}

pub fn legacy_root(lora_dir: &str) -> Option<String> {
    let dir = Path::new(lora_dir);
    let models = dir.parent()?;
    if !dir.file_name()?.to_str()?.eq_ignore_ascii_case("loras")
        || !models.file_name()?.to_str()?.eq_ignore_ascii_case("models")
    {
        return None;
    }
    let root = models.parent()?;
    resolve_root(root.to_str()?)
        .ok()
        .map(|path| display_path(&path))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn binds_chinese_portable_root_and_creates_lora_directory() {
        let dir = tempfile::tempdir().unwrap();
        let portable = dir.path().join("中文便携版");
        let root = portable.join("ComfyUI");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("main.py"), "").unwrap();
        let (resolved, loras) = bind(portable.to_str().unwrap()).unwrap();
        assert_eq!(
            Path::new(&resolved).canonicalize().unwrap(),
            root.canonicalize().unwrap()
        );
        assert!(Path::new(&loras).is_dir());
        assert_eq!(legacy_root(&loras), Some(resolved));
    }
    #[test]
    fn rejects_wrong_directory_without_creating_models() {
        let dir = tempfile::tempdir().unwrap();
        assert!(bind(dir.path().to_str().unwrap()).is_err());
        assert!(!dir.path().join("models").exists());
        assert!(bind("relative/path").is_err());
    }
    #[test]
    fn old_settings_preserve_network_preferences_without_server_url() {
        let settings: crate::types::Settings = serde_json::from_value(serde_json::json!({
            "loraDir":"D:\\old-models", "comfyUrl":"http://127.0.0.1:8188",
            "proxyMode":"manual", "proxyUrl":"http://127.0.0.1:7890", "safeContent":false
        }))
        .unwrap();
        assert!(settings.comfy_root.is_empty());
        assert_eq!(settings.lora_dir, "D:\\old-models");
        assert_eq!(settings.proxy_mode, "manual");
        assert!(!serde_json::to_value(settings)
            .unwrap()
            .as_object()
            .unwrap()
            .contains_key("comfyUrl"));
    }
}
