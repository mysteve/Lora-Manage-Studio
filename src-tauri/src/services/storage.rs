use crate::{services::site, types::*, AppState};
use futures_util::StreamExt;
use sha2::{Digest, Sha256};
use std::{
    path::{Path, PathBuf},
    sync::{atomic::Ordering, Arc},
};
use tauri::Emitter;
use tokio::io::AsyncReadExt;

pub fn validate_directory(value: &str) -> Result<PathBuf, String> {
    let path = Path::new(value);
    if value.trim().is_empty() || !path.is_absolute() {
        return Err("请选择绝对路径的 LoRA 文件夹".into());
    }
    let canonical = path
        .canonicalize()
        .map_err(|_| "LoRA 文件夹不存在或无法访问")?;
    if !canonical.is_dir() {
        return Err("指定路径不是文件夹".into());
    }
    Ok(canonical)
}
pub fn sanitize_filename(name: &str, version: u64, file: u64) -> String {
    let stem = Path::new(name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("model");
    let mut clean: String = stem
        .chars()
        .map(|c| {
            if c.is_control() || "<>:\"/\\|?*".contains(c) {
                '_'
            } else {
                c
            }
        })
        .take(90)
        .collect();
    clean = clean.trim_matches([' ', '.']).to_string();
    if clean.is_empty() {
        clean = "model".into()
    }
    // Prefix makes all Windows reserved basenames harmless, including CON / AUX.
    format!("lora_{clean}_v{version}_f{file}.safetensors")
}
pub async fn hash_file(path: &Path) -> Result<String, String> {
    let mut file = tokio::fs::File::open(path)
        .await
        .map_err(|e| format!("无法读取模型文件：{e}"))?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0; 1024 * 1024];
    loop {
        let n = file.read(&mut buf).await.map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hex::encode(hasher.finalize()))
}
pub fn file_info(path: &Path) -> Result<(u64, u64), String> {
    let m = std::fs::metadata(path).map_err(|e| e.to_string())?;
    Ok((
        m.len(),
        m.modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|v| v.as_nanos().min(u64::MAX as u128) as u64)
            .unwrap_or(0),
    ))
}
pub fn cover_url(input: &str) -> Result<url::Url, String> {
    let url = url::Url::parse(input).map_err(|_| "封面地址无效")?;
    let host = url.host_str().unwrap_or("");
    if url.scheme() != "https"
        || !(host == "civitai.com"
            || host.ends_with(".civitai.com")
            || host == "civitai.red"
            || host.ends_with(".civitai.red"))
    {
        return Err("仅允许 Civitai 的 HTTPS 封面地址".into());
    }
    Ok(url)
}
async fn save_image(bytes: Vec<u8>, dest: PathBuf) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let mut reader = image::ImageReader::new(std::io::Cursor::new(bytes))
            .with_guessed_format()
            .map_err(|_| "无法识别图片")?;
        let mut limits = image::Limits::default();
        limits.max_image_width = Some(16384);
        limits.max_image_height = Some(16384);
        limits.max_alloc = Some(256 * 1024 * 1024);
        reader.limits(limits);
        let img = reader
            .decode()
            .map_err(|_| "图片格式不支持或超过尺寸限制")?
            .thumbnail(1400, 1400);
        let part = dest.with_extension(format!("{}.tmp", uuid::Uuid::new_v4()));
        img.save_with_format(&part, image::ImageFormat::Png)
            .map_err(|e| e.to_string())?;
        if let Err(e) = std::fs::rename(&part, &dest) {
            let _ = std::fs::remove_file(&part);
            if !dest.exists() {
                return Err(e.to_string());
            }
        }
        Ok(dest.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
pub async fn cache_image(state: &AppState, input: &str) -> Result<Cover, String> {
    let url = cover_url(input)?;
    let key = hex::encode(Sha256::digest(input.as_bytes()));
    let path = state.data_dir.join("covers").join(format!("{key}.png"));
    if path.is_file() {
        return Ok(Cover {
            url: input.into(),
            local_path: path.to_string_lossy().into(),
        });
    }
    let resp = site::client(&state.db.settings())?
        .get(url)
        .send()
        .await
        .map_err(site::network_error)?;
    if !resp.status().is_success() {
        return Err(site::status_error(resp.status()));
    }
    if resp.content_length().unwrap_or(0) > 20 * 1024 * 1024 {
        return Err("封面超过 20 MB".into());
    }
    let mut bytes = Vec::new();
    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(site::network_error)?;
        if bytes.len() + chunk.len() > 20 * 1024 * 1024 {
            return Err("封面超过 20 MB".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    let local_path = save_image(bytes, path).await?;
    Ok(Cover {
        url: input.into(),
        local_path,
    })
}
pub async fn import_image(state: &AppState, path: &str) -> Result<Cover, String> {
    let p = Path::new(path);
    let meta = tokio::fs::metadata(p)
        .await
        .map_err(|_| "无法访问封面图片")?;
    if meta.len() > 20 * 1024 * 1024 {
        return Err("封面超过 20 MB".into());
    }
    let bytes = tokio::fs::read(p).await.map_err(|e| e.to_string())?;
    let dest = state
        .data_dir
        .join("covers")
        .join(format!("custom-{}.png", uuid::Uuid::new_v4()));
    Ok(Cover {
        url: String::new(),
        local_path: save_image(bytes, dest).await?,
    })
}
pub async fn enrich(
    state: &AppState,
    mut entry: LibraryEntry,
    model: &RemoteModel,
    version: &ModelVersion,
) -> Result<LibraryEntry, String> {
    entry.model_id = Some(model.id);
    entry.author = model.author.clone();
    entry.base_model = version.base_model.clone();
    if entry.version.is_none() {
        entry.name = model.name.clone();
        entry.tags = model.tags.clone();
    }
    let mut v = version.clone();
    for c in v.images.iter_mut().take(4) {
        if let Ok(cached) = cache_image(state, &c.url).await {
            *c = cached
        }
    }
    if !entry.custom_cover {
        entry.cover = v.images.first().cloned().unwrap_or_default();
    }
    entry.version = Some(v);
    entry.verified = version
        .files
        .iter()
        .any(|f| !f.sha256.is_empty() && f.sha256.eq_ignore_ascii_case(&entry.sha256));
    Ok(entry)
}
pub fn merge_personal(latest: &LibraryEntry, mut updated: LibraryEntry) -> LibraryEntry {
    updated.name = latest.name.clone();
    updated.trigger_words = latest.trigger_words.clone();
    updated.notes = latest.notes.clone();
    updated.tags = latest.tags.clone();
    updated.favorite = latest.favorite;
    updated.custom_cover = latest.custom_cover;
    if latest.custom_cover {
        updated.cover = latest.cover.clone();
    }
    updated
}
pub fn normalize_trigger_words(words: Vec<String>) -> Vec<String> {
    let mut unique = std::collections::HashSet::new();
    words
        .into_iter()
        .map(|word| word.trim().to_owned())
        .filter(|word| !word.is_empty() && unique.insert(word.to_lowercase()))
        .collect()
}
pub async fn bind(state: &AppState, id: &str, link: &str) -> Result<LibraryEntry, String> {
    let old: LibraryEntry = state.db.get("library", id)?;
    let path = Path::new(&old.path);
    let hash = hash_file(path).await?;
    let (size, modified) = file_info(path)?;
    let (model, vid) = site::resolve(&state.db.settings(), link).await?;
    let version = model
        .versions
        .iter()
        .find(|v| v.id == vid)
        .ok_or("版本不存在")?;
    if !version
        .files
        .iter()
        .any(|f| !f.sha256.is_empty() && f.sha256.eq_ignore_ascii_case(&hash))
    {
        return Err("当前文件的 SHA-256 与该版本不一致，未绑定。请检查模型版本。".into());
    }
    let mut fresh = old.clone();
    fresh.sha256 = hash;
    fresh.size = size;
    fresh.modified = modified;
    fresh.missing = false;
    let enriched = enrich(state, fresh, &model, version).await?;
    let latest: LibraryEntry = state.db.get("library", id)?;
    let result = merge_personal(&latest, enriched);
    if old.version.is_none() {
        for mut r in state
            .db
            .list::<Recipe>("recipes")?
            .into_iter()
            .filter(|r| r.owner == old.recipe_owner())
        {
            r.owner = result.recipe_owner();
            state.db.put("recipes", &r.id, &r)?;
        }
    }
    state.db.put("library", id, &result)?;
    Ok(result)
}
pub fn start_scan(state: Arc<AppState>, app: tauri::AppHandle) -> Result<(), String> {
    let dir = validate_directory(&state.db.settings().lora_dir)?;
    if state.scanning.swap(true, Ordering::SeqCst) {
        return Err("扫描正在进行中".into());
    }
    tauri::async_runtime::spawn(async move {
        let mut progress = ScanProgress {
            running: true,
            processed: 0,
            matched: 0,
            current: "正在读取目录".into(),
            errors: vec![],
        };
        let _ = app.emit("scan-progress", &progress);
        let result = scan(&state, &app, &dir, &mut progress).await;
        if let Err(e) = result {
            progress.errors.push(e)
        }
        progress.running = false;
        progress.current = "扫描完成".into();
        state.scanning.store(false, Ordering::SeqCst);
        let _ = app.emit("scan-progress", &progress);
        let _ = app.emit("library-changed", ());
    });
    Ok(())
}
async fn scan(
    state: &AppState,
    app: &tauri::AppHandle,
    dir: &Path,
    progress: &mut ScanProgress,
) -> Result<(), String> {
    let root = dir.to_path_buf();
    let paths = tokio::task::spawn_blocking(move || {
        let mut files = vec![];
        let mut errors = vec![];
        for entry in walkdir::WalkDir::new(&root).follow_links(false) {
            match entry {
                Ok(e) => {
                    if e.file_type().is_file()
                        && ["safetensors", "ckpt", "pt", "bin"].contains(
                            &e.path()
                                .extension()
                                .and_then(|v| v.to_str())
                                .unwrap_or("")
                                .to_lowercase()
                                .as_str(),
                        )
                    {
                        files.push(e.path().to_path_buf())
                    }
                }
                Err(e) => errors.push(e.to_string()),
            }
        }
        (files, errors)
    })
    .await
    .map_err(|e| e.to_string())?;
    progress.errors.extend(paths.1.into_iter().take(20));
    let existing = state.db.list::<LibraryEntry>("library")?;
    let mut lookup_enabled = true;
    for path in paths.0 {
        progress.current = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into();
        let _ = app.emit("scan-progress", &progress);
        let result: Result<(), String> = async {
            let (size, modified) = file_info(&path)?;
            let path_string = path.to_string_lossy().to_string();
            let old = existing
                .iter()
                .find(|e| e.path.eq_ignore_ascii_case(&path_string));
            if let Some(e) = old {
                if e.size == size && e.modified == modified && e.version.is_some() && !e.missing {
                    return Ok(());
                }
            }
            let mut entry = old.cloned().unwrap_or_else(|| LibraryEntry {
                id: uuid::Uuid::new_v4().to_string(),
                path: path_string.clone(),
                name: path
                    .file_stem()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .into(),
                created_at: now(),
                ..Default::default()
            });
            if entry.size != size || entry.modified != modified || entry.sha256.is_empty() {
                entry.sha256 = hash_file(&path).await?;
                entry.verified = false;
                entry.version = None;
                entry.model_id = None;
            }
            entry.size = size;
            entry.modified = modified;
            entry.missing = false;
            state.db.put("library", &entry.id, &entry)?;
            if lookup_enabled {
                match site::api(
                    &state.db.settings(),
                    &format!("/api/v1/model-versions/by-hash/{}", entry.sha256),
                    &[],
                )
                .await
                {
                    Ok(value) => {
                        let version = site::version(&value, 0);
                        let model = site::get_model(&state.db.settings(), version.model_id).await?;
                        let enriched = enrich(state, entry.clone(), &model, &version).await?;
                        // Reload before saving so edits made during network requests survive.
                        if let Ok(latest) = state.db.get::<LibraryEntry>("library", &entry.id) {
                            let result = if old.is_some() {
                                merge_personal(&latest, enriched)
                            } else {
                                enriched
                            };
                            if old.is_some_and(|e| e.version.is_none()) {
                                for mut recipe in state
                                    .db
                                    .list::<Recipe>("recipes")?
                                    .into_iter()
                                    .filter(|r| r.owner == format!("local:{}", entry.id))
                                {
                                    recipe.owner = result.recipe_owner();
                                    state.db.put("recipes", &recipe.id, &recipe)?;
                                }
                            }
                            state.db.put("library", &result.id, &result)?;
                        }
                        progress.matched += 1;
                    }
                    Err(e) => {
                        if !e.contains("不存在") {
                            lookup_enabled = false;
                            progress
                                .errors
                                .push(format!("本次联网补齐已暂停：{e}；其余文件仍会登记"));
                        }
                    }
                }
                tokio::time::sleep(std::time::Duration::from_millis(300)).await;
            }
            Ok(())
        }
        .await;
        if let Err(e) = result {
            if progress.errors.len() < 20 {
                progress.errors.push(format!("{}：{e}", progress.current));
            }
        }
        progress.processed += 1;
        let _ = app.emit("scan-progress", &progress);
        let _ = app.emit("library-changed", ());
    }
    for mut entry in state.db.list::<LibraryEntry>("library")? {
        if Path::new(&entry.path).starts_with(dir) {
            entry.missing = !Path::new(&entry.path).is_file();
            state.db.put("library", &entry.id, &entry)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn names_cannot_escape() {
        for name in [
            "../../escape.safetensors",
            "CON.safetensors",
            "a:b?.safetensors",
            "中文模型.safetensors",
        ] {
            let f = sanitize_filename(name, 10, 20);
            assert!(!f.contains(['/', '\\', ':', '?']));
            assert!(f.ends_with("_v10_f20.safetensors"));
            assert!(f.starts_with("lora_"));
        }
    }
    #[test]
    fn merge_preserves_edits() {
        let a = LibraryEntry {
            name: "自定义名称".into(),
            trigger_words: vec!["my style".into()],
            notes: "备注".into(),
            favorite: true,
            custom_cover: true,
            cover: Cover {
                url: String::new(),
                local_path: "mine.png".into(),
            },
            ..Default::default()
        };
        let b = LibraryEntry {
            name: "new remote".into(),
            verified: true,
            ..Default::default()
        };
        let m = merge_personal(&a, b);
        assert_eq!(m.name, a.name);
        assert_eq!(m.trigger_words, a.trigger_words);
        assert_eq!(m.cover.local_path, "mine.png");
        assert!(m.favorite && m.verified);
    }
    #[test]
    fn custom_triggers_are_trimmed_and_deduplicated() {
        assert_eq!(
            normalize_trigger_words(vec![
                " Style ".into(),
                "style".into(),
                "".into(),
                "soft light".into()
            ]),
            vec!["Style", "soft light"]
        );
    }
    #[tokio::test]
    async fn local_cover_is_copied_into_app_storage() {
        let dir = tempfile::tempdir().unwrap();
        let source = dir.path().join("我的封面.png");
        image::RgbaImage::from_pixel(4, 4, image::Rgba([12, 34, 56, 255]))
            .save(&source)
            .unwrap();
        let state = AppState::open(dir.path().join("data")).unwrap();
        let cover = import_image(&state, source.to_str().unwrap())
            .await
            .unwrap();
        assert!(cover.url.is_empty());
        assert!(Path::new(&cover.local_path).starts_with(state.data_dir.join("covers")));
        std::fs::remove_file(source).unwrap();
        assert!(image::open(&cover.local_path).is_ok());
    }
    #[tokio::test]
    async fn hashes_known_file() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("中文.bin");
        std::fs::write(&p, b"abc").unwrap();
        assert_eq!(
            hash_file(&p).await.unwrap(),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }
}
