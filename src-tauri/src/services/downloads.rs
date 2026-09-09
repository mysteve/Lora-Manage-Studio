use crate::{
    services::{site, storage},
    types::*,
    AppState,
};
use futures_util::StreamExt;
use reqwest::{header, StatusCode};
use std::{
    path::{Path, PathBuf},
    sync::Arc,
    time::Instant,
};
use tauri::Emitter;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio_util::sync::CancellationToken;

pub fn partial_path(task: &DownloadTask) -> PathBuf {
    Path::new(&task.destination).with_extension(format!("{}.part", task.id))
}
fn publish(state: &AppState, app: &tauri::AppHandle, task: &DownloadTask) -> Result<(), String> {
    state.db.put("downloads", &task.id, task)?;
    let _ = app.emit("download-progress", task);
    Ok(())
}
pub async fn enqueue(
    state: Arc<AppState>,
    app: tauri::AppHandle,
    model_id: u64,
    version_id: u64,
    file_id: u64,
) -> Result<DownloadTask, String> {
    let dir = storage::validate_directory(&state.db.settings().lora_dir)?;
    let model = site::get_model(&state.db.settings(), model_id).await?;
    let mut version = site::get_version(&state.db.settings(), version_id).await?;
    if version.model_id != model.id {
        return Err("版本与模型不匹配".into());
    }
    let file = version
        .files
        .iter()
        .find(|f| f.id == file_id)
        .ok_or("文件不存在，请刷新版本信息")?
        .clone();
    if !file.name.to_lowercase().ends_with(".safetensors") {
        return Err("首版仅下载 SafeTensor 文件".into());
    }
    site::safe_download_url(&file.download_url)?;
    for e in state.db.list::<LibraryEntry>("library")? {
        if !file.sha256.is_empty()
            && e.sha256.eq_ignore_ascii_case(&file.sha256)
            && storage::file_info(Path::new(&e.path)).is_ok_and(|info| info == (e.size, e.modified))
        {
            return Err(format!("此模型已安装：{}", e.name));
        }
    }
    if let Some(cover) = version.images.first_mut() {
        if let Ok(c) = storage::cache_preview(&state, cover).await {
            *cover = c
        }
    }
    let destination = dir.join(storage::sanitize_filename(&file.name, version.id, file.id));
    // Serialize duplicate check + insertion against concurrent enqueue calls.
    {
        let _guard = state.workers.lock().map_err(|e| e.to_string())?;
        for t in state.db.list::<DownloadTask>("downloads")? {
            if t.file.id == file.id && !["cancelled", "completed"].contains(&t.status.as_str()) {
                return Err("此文件已在下载中心，请继续或重试现有任务".into());
            }
        }
        if destination.exists() {
            return Err("目标文件已存在，请先扫描本地模型；不会覆盖已有文件".into());
        }
    }
    let task = DownloadTask {
        id: uuid::Uuid::new_v4().to_string(),
        model,
        version,
        file: file.clone(),
        destination: destination.to_string_lossy().into(),
        status: "queued".into(),
        downloaded: 0,
        total: (file.size_kb * 1024.0) as u64,
        speed: 0.0,
        error: String::new(),
        created_at: now(),
    };
    {
        let _guard = state.workers.lock().map_err(|e| e.to_string())?;
        if state.db.list::<DownloadTask>("downloads")?.iter().any(|t| {
            t.file.id == file.id && !["cancelled", "completed"].contains(&t.status.as_str())
        }) {
            return Err("此文件已在下载中心".into());
        }
        publish(&state, &app, &task)?;
    }
    start(state, app, task.id.clone())?;
    Ok(task)
}
pub fn start(state: Arc<AppState>, app: tauri::AppHandle, id: String) -> Result<(), String> {
    let cancel = CancellationToken::new();
    {
        let mut workers = state.workers.lock().map_err(|e| e.to_string())?;
        if workers.contains_key(&id) {
            return Err("任务仍在停止，请稍后继续".into());
        }
        workers.insert(id.clone(), cancel.clone());
    }
    tauri::async_runtime::spawn(async move {
        let result = tokio::select! {
            _=cancel.cancelled()=>Err("任务已停止".to_string()),
            result=async{
                let _permit=state.semaphore.clone().acquire_owned().await.map_err(|e|e.to_string())?;
                transfer(&state,&app,&id,&cancel).await
            }=>result
        };
        if let Ok(mut task) = state.db.get::<DownloadTask>("downloads", &id) {
            if !cancel.is_cancelled() {
                if let Err(error) = result {
                    task.status = "failed".into();
                    task.error = error;
                    task.speed = 0.0;
                    let _ = publish(&state, &app, &task);
                }
            } else if task.status == "cancelled" {
                let _ = tokio::fs::remove_file(partial_path(&task)).await;
            }
        }
        if let Ok(mut workers) = state.workers.lock() {
            workers.remove(&id);
        }
    });
    Ok(())
}
pub fn control(
    state: Arc<AppState>,
    app: tauri::AppHandle,
    id: String,
    action: String,
) -> Result<(), String> {
    let mut task: DownloadTask = state.db.get("downloads", &id)?;
    if action == "resume" || action == "retry" {
        {
            let workers = state.workers.lock().map_err(|e| e.to_string())?;
            if workers.contains_key(&id) {
                return Err("任务正在运行或停止，请稍后重试".into());
            }
        }
        if !["paused", "failed"].contains(&task.status.as_str()) {
            return Err("此任务不能继续".into());
        }
        task.status = "queued".into();
        task.error.clear();
        publish(&state, &app, &task)?;
        return start(state, app, id);
    }
    let workers = state.workers.lock().map_err(|e| e.to_string())?;
    task = state.db.get("downloads", &id)?;
    if task.status == "completed" || task.status == "cancelled" {
        return Err("任务已经结束".into());
    }
    task.status = match action.as_str() {
        "pause" => "paused",
        "cancel" => "cancelled",
        _ => return Err("未知的下载操作".into()),
    }
    .into();
    task.speed = 0.0;
    task.error.clear();
    publish(&state, &app, &task)?;
    if let Some(token) = workers.get(&id) {
        token.cancel();
    } else if action == "cancel" {
        let _ = std::fs::remove_file(partial_path(&task));
    }
    Ok(())
}
fn update_progress(
    state: &AppState,
    app: &tauri::AppHandle,
    task: &DownloadTask,
) -> Result<(), String> {
    let _guard = state.workers.lock().map_err(|e| e.to_string())?;
    let mut latest: DownloadTask = state.db.get("downloads", &task.id)?;
    if !["queued", "downloading", "verifying"].contains(&latest.status.as_str()) {
        return Err("任务已停止".into());
    }
    latest.status = task.status.clone();
    latest.downloaded = task.downloaded;
    latest.total = task.total;
    latest.speed = task.speed;
    latest.file = task.file.clone();
    publish(state, app, &latest)
}
pub fn parse_range(value: &str) -> Option<(u64, u64, u64)> {
    let rest = value.strip_prefix("bytes ")?;
    let (range, total) = rest.split_once('/')?;
    let (start, end) = range.split_once('-')?;
    let (start, end, total) = (start.parse().ok()?, end.parse().ok()?, total.parse().ok()?);
    if start > end || end >= total {
        return None;
    }
    Some((start, end, total))
}
pub fn resume_offset(
    status: StatusCode,
    range: Option<&str>,
    offset: u64,
) -> Result<(u64, Option<u64>), String> {
    if status == StatusCode::PARTIAL_CONTENT {
        let (start, _, total) = range
            .and_then(parse_range)
            .ok_or("服务器断点响应无效，不能安全续传")?;
        if start != offset {
            return Err("服务器返回的断点位置不匹配".into());
        }
        Ok((offset, Some(total)))
    } else if status == StatusCode::OK {
        Ok((0, None))
    } else {
        Err(site::status_error(status))
    }
}
async fn transfer(
    state: &AppState,
    app: &tauri::AppHandle,
    id: &str,
    cancel: &CancellationToken,
) -> Result<(), String> {
    let mut task: DownloadTask = state.db.get("downloads", id)?;
    let target = Path::new(&task.destination).to_path_buf();
    let parent = target.parent().ok_or("目标目录无效")?;
    storage::validate_directory(&parent.to_string_lossy())?;
    let part = partial_path(&task);
    // A restart between atomic installation and DB commit can leave a valid final file.
    if target.exists() {
        if !task.file.sha256.is_empty()
            && storage::hash_file(&target)
                .await?
                .eq_ignore_ascii_case(&task.file.sha256)
        {
            return finish(state, app, &mut task, &target, cancel, false);
        }
        return Err("目标文件已存在且未确认一致，未覆盖文件".into());
    }
    let fresh = site::get_version(&state.db.settings(), task.version.id).await?;
    let current = fresh
        .files
        .iter()
        .find(|f| f.id == task.file.id)
        .ok_or("文件已从网站移除")?
        .clone();
    if current.sha256.is_empty() || !current.sha256.eq_ignore_ascii_case(&task.file.sha256) {
        let _ = tokio::fs::remove_file(&part).await;
        task.downloaded = 0;
    }
    task.file = current;
    task.status = "downloading".into();
    task.error.clear();
    update_progress(state, app, &task)?;
    let url = site::safe_download_url(&task.file.download_url)?;
    let offset = tokio::fs::metadata(&part)
        .await
        .map(|m| m.len())
        .unwrap_or(0);
    let cli = site::client(&state.db.settings())?;
    let mut request = cli
        .get(url.clone())
        .header(header::ACCEPT_ENCODING, "identity");
    if offset > 0 {
        request = request.header(header::RANGE, format!("bytes={offset}-"));
    }
    if let Some(token) = super::auth::token(&state.db.settings()).await? {
        request = request.bearer_auth(token)
    }
    let mut response = request.send().await.map_err(site::network_error)?;
    if response.status() == StatusCode::RANGE_NOT_SATISFIABLE {
        if offset > 0
            && !task.file.sha256.is_empty()
            && storage::hash_file(&part)
                .await?
                .eq_ignore_ascii_case(&task.file.sha256)
        {
            task.downloaded = offset;
            task.total = offset;
            return verify_and_install(state, app, &mut task, &part, &target, cancel).await;
        }
        let _ = tokio::fs::remove_file(&part).await;
        let mut request = cli.get(url).header(header::ACCEPT_ENCODING, "identity");
        if let Some(token) = super::auth::token(&state.db.settings()).await? {
            request = request.bearer_auth(token)
        }
        response = request.send().await.map_err(site::network_error)?;
    }
    if !response.status().is_success() {
        return Err(site::status_error(response.status()));
    }
    if response
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.contains("text/html") || v.contains("application/json"))
    {
        return Err("下载返回登录页或错误信息，没有保存为模型".into());
    }
    task.downloaded = receive_response(response, &part, offset, |downloaded, total, speed| {
        task.downloaded = downloaded;
        task.total = total.unwrap_or((task.file.size_kb * 1024.0) as u64);
        task.speed = speed;
        update_progress(state, app, &task)
    })
    .await?;
    if task.file.size_kb > 0.0
        && ((task.file.size_kb * 1024.0) - task.downloaded as f64).abs() > 2048.0
    {
        return Err("下载大小与网站文件信息不一致，请刷新后重试".into());
    }
    task.total = task.downloaded;
    verify_and_install(state, app, &mut task, &part, &target, cancel).await
}
async fn receive_response(
    mut_response: reqwest::Response,
    path: &Path,
    offset: u64,
    mut progress: impl FnMut(u64, Option<u64>, f64) -> Result<(), String>,
) -> Result<u64, String> {
    let (start, total) = resume_offset(
        mut_response.status(),
        mut_response
            .headers()
            .get(header::CONTENT_RANGE)
            .and_then(|v| v.to_str().ok()),
        offset,
    )?;
    let expected = total.or_else(|| mut_response.content_length().map(|n| n + start));
    let mut file = tokio::fs::OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(start == 0)
        .append(start > 0)
        .open(path)
        .await
        .map_err(|e| format!("无法创建下载文件：{e}"))?;
    let mut stream = mut_response.bytes_stream();
    let mut downloaded = start;
    let mut last = Instant::now();
    let mut last_bytes = start;
    progress(downloaded, expected, 0.0)?;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(site::network_error)?;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("无法写入模型，请检查磁盘空间：{e}"))?;
        downloaded += chunk.len() as u64;
        if last.elapsed().as_millis() >= 400 {
            progress(
                downloaded,
                expected,
                (downloaded - last_bytes) as f64 / last.elapsed().as_secs_f64(),
            )?;
            last = Instant::now();
            last_bytes = downloaded;
        }
    }
    file.flush().await.map_err(|e| e.to_string())?;
    file.sync_all().await.map_err(|e| e.to_string())?;
    if expected.is_some_and(|n| n != downloaded) {
        return Err("下载未完成，文件大小与服务器不一致，可继续下载".into());
    }
    Ok(downloaded)
}
pub async fn verify_checksum(path: &Path, expected: &str) -> Result<String, String> {
    let sha = storage::hash_file(path).await?;
    if !expected.is_empty() && !sha.eq_ignore_ascii_case(expected) {
        let _ = tokio::fs::remove_file(path).await;
        return Err("SHA-256 校验失败，损坏的临时文件已清除，请重试".into());
    }
    Ok(sha)
}
pub async fn validate_safetensors(path: &Path) -> Result<(), String> {
    let mut f = tokio::fs::File::open(path)
        .await
        .map_err(|e| e.to_string())?;
    let size = f.metadata().await.map_err(|e| e.to_string())?.len();
    let mut length = [0u8; 8];
    f.read_exact(&mut length)
        .await
        .map_err(|_| "文件不是有效的 SafeTensor")?;
    let n = u64::from_le_bytes(length);
    if !(2..=100 * 1024 * 1024).contains(&n) || n + 8 > size {
        return Err("文件不是有效的 SafeTensor：头部长度错误".into());
    }
    let mut json = vec![0; n as usize];
    f.read_exact(&mut json)
        .await
        .map_err(|_| "SafeTensor 头部不完整")?;
    let v: serde_json::Value =
        serde_json::from_slice(&json).map_err(|_| "SafeTensor 头部不是 JSON")?;
    if !v.is_object() {
        return Err("SafeTensor 头部格式错误".into());
    }
    Ok(())
}
async fn verify_and_install(
    state: &AppState,
    app: &tauri::AppHandle,
    task: &mut DownloadTask,
    part: &Path,
    target: &Path,
    cancel: &CancellationToken,
) -> Result<(), String> {
    task.status = "verifying".into();
    task.speed = 0.0;
    update_progress(state, app, task)?;
    let sha = verify_checksum(part, &task.file.sha256).await?;
    validate_safetensors(part).await?;
    finish_with_hash(state, app, task, part, target, cancel, sha)
}
fn finish_with_hash(
    state: &AppState,
    app: &tauri::AppHandle,
    task: &mut DownloadTask,
    part: &Path,
    target: &Path,
    cancel: &CancellationToken,
    sha: String,
) -> Result<(), String> {
    let _guard = state.workers.lock().map_err(|e| e.to_string())?;
    if cancel.is_cancelled() {
        return Err("任务已停止".into());
    }
    install_no_replace(part, target)?;
    record_install(state, app, task, target, sha)
}
fn finish(
    state: &AppState,
    app: &tauri::AppHandle,
    task: &mut DownloadTask,
    target: &Path,
    cancel: &CancellationToken,
    _install: bool,
) -> Result<(), String> {
    let _guard = state.workers.lock().map_err(|e| e.to_string())?;
    if cancel.is_cancelled() {
        return Err("任务已停止".into());
    }
    record_install(state, app, task, target, task.file.sha256.clone())
}
fn record_install(
    state: &AppState,
    app: &tauri::AppHandle,
    task: &mut DownloadTask,
    target: &Path,
    sha: String,
) -> Result<(), String> {
    let (size, modified) = storage::file_info(target)?;
    let existing = state
        .db
        .list::<LibraryEntry>("library")?
        .into_iter()
        .find(|e| e.path == task.destination);
    if let Some(mut entry) = existing {
        entry.size = size;
        entry.modified = modified;
        entry.sha256 = sha;
        entry.missing = false;
        entry.verified = !task.file.sha256.is_empty();
        entry.version = Some(task.version.clone());
        entry.model_id = Some(task.model.id);
        state.db.put("library", &entry.id, &entry)?;
    } else {
        let entry = LibraryEntry {
            id: uuid::Uuid::new_v4().to_string(),
            path: task.destination.clone(),
            size,
            modified,
            sha256: sha,
            name: task.model.name.clone(),
            author: task.model.author.clone(),
            base_model: task.version.base_model.clone(),
            tags: task.model.tags.clone(),
            verified: !task.file.sha256.is_empty(),
            cover: task.version.images.first().cloned().unwrap_or_default(),
            model_id: Some(task.model.id),
            version: Some(task.version.clone()),
            created_at: now(),
            ..Default::default()
        };
        state.db.put("library", &entry.id, &entry)?;
    }
    task.status = "completed".into();
    task.downloaded = size;
    task.total = size;
    task.speed = 0.0;
    task.error.clear();
    publish(state, app, task)?;
    let _ = app.emit("library-changed", ());
    Ok(())
}
pub fn install_no_replace(source: &Path, target: &Path) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        let src: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
        let dst: Vec<u16> = target.as_os_str().encode_wide().chain(Some(0)).collect();
        // No REPLACE_EXISTING flag: one atomic move, never overwrite a model.
        let result = unsafe {
            windows_sys::Win32::Storage::FileSystem::MoveFileExW(
                src.as_ptr(),
                dst.as_ptr(),
                windows_sys::Win32::Storage::FileSystem::MOVEFILE_WRITE_THROUGH,
            )
        };
        if result == 0 {
            return Err(format!(
                "无法安装模型（不会覆盖已有文件）：{}",
                std::io::Error::last_os_error()
            ));
        }
    }
    #[cfg(not(windows))]
    {
        std::fs::hard_link(source, target).map_err(|e| e.to_string())?;
        std::fs::remove_file(source).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    async fn response(raw: &'static [u8]) -> reqwest::Response {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            let mut buf = [0; 4096];
            let _ = stream.read(&mut buf).await;
            stream.write_all(raw).await.unwrap();
            stream.shutdown().await.unwrap();
        });
        reqwest::Client::builder()
            .no_proxy()
            .build()
            .unwrap()
            .get(format!("http://{addr}/model"))
            .send()
            .await
            .unwrap()
    }
    #[tokio::test]
    async fn server_ignores_range_restarts_without_appending() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("model.part");
        std::fs::write(&p, b"old").unwrap();
        let r =
            response(b"HTTP/1.1 200 OK\r\nContent-Length: 6\r\nConnection: close\r\n\r\nabcdef")
                .await;
        assert_eq!(
            receive_response(r, &p, 3, |_, _, _| Ok(())).await.unwrap(),
            6
        );
        assert_eq!(std::fs::read(p).unwrap(), b"abcdef");
    }
    #[tokio::test]
    async fn server_range_resumes_from_existing_prefix() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("model.part");
        std::fs::write(&p, b"abc").unwrap();
        let r=response(b"HTTP/1.1 206 Partial Content\r\nContent-Length: 3\r\nContent-Range: bytes 3-5/6\r\nConnection: close\r\n\r\ndef").await;
        assert_eq!(
            receive_response(r, &p, 3, |_, _, _| Ok(())).await.unwrap(),
            6
        );
        assert_eq!(std::fs::read(p).unwrap(), b"abcdef");
    }
    #[tokio::test]
    async fn truncated_response_does_not_complete() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("model.part");
        let r = response(b"HTTP/1.1 200 OK\r\nContent-Length: 12\r\nConnection: close\r\n\r\nabc")
            .await;
        assert!(receive_response(r, &p, 0, |_, _, _| Ok(())).await.is_err());
        assert!(!d.path().join("model.safetensors").exists());
    }
    #[tokio::test]
    async fn checksum_mismatch_removes_partial_file() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("model.part");
        std::fs::write(&p, b"wrong").unwrap();
        assert!(verify_checksum(&p, "bad-hash").await.is_err());
        assert!(!p.exists());
    }
    #[tokio::test]
    async fn cannot_write_into_file_as_directory() {
        let d = tempfile::tempdir().unwrap();
        let parent = d.path().join("file");
        std::fs::write(&parent, b"x").unwrap();
        let r =
            response(b"HTTP/1.1 200 OK\r\nContent-Length: 1\r\nConnection: close\r\n\r\na").await;
        assert!(
            receive_response(r, &parent.join("model.part"), 0, |_, _, _| Ok(()))
                .await
                .is_err()
        );
    }
    #[test]
    fn validates_ranges() {
        assert_eq!(parse_range("bytes 10-19/20"), Some((10, 19, 20)));
        assert_eq!(parse_range("bytes 10-20/20"), None);
        assert!(resume_offset(StatusCode::PARTIAL_CONTENT, Some("bytes 0-19/20"), 10).is_err());
        assert_eq!(resume_offset(StatusCode::OK, None, 10).unwrap(), (0, None));
    }
    #[test]
    fn never_overwrites() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("test.part");
        let dst = dir.path().join("中文.safetensors");
        std::fs::write(&src, b"new").unwrap();
        std::fs::write(&dst, b"old").unwrap();
        assert!(install_no_replace(&src, &dst).is_err());
        assert_eq!(std::fs::read(&dst).unwrap(), b"old");
        std::fs::remove_file(&dst).unwrap();
        install_no_replace(&src, &dst).unwrap();
        assert_eq!(std::fs::read(dst).unwrap(), b"new");
    }
    #[tokio::test]
    async fn rejects_html() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("bad.part");
        std::fs::write(&p, b"<html>login</html>").unwrap();
        assert!(validate_safetensors(&p).await.is_err());
    }
}
