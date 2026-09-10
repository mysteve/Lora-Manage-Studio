use crate::{
    services::{auth, downloads, site, storage},
    types::*,
    AppState,
};
use serde::{Deserialize, Serialize};
use std::{path::Path, sync::Arc};
use tauri::{Emitter, State};

type Shared<'a> = State<'a, Arc<AppState>>;
#[tauri::command]
pub fn get_settings(state: Shared<'_>) -> Settings {
    let mut settings = state.db.settings();
    if settings.comfy_root.is_empty() {
        settings.comfy_root =
            crate::services::workspace::legacy_root(&settings.lora_dir).unwrap_or_default();
    }
    settings
}
#[tauri::command]
pub fn dismiss_setup(state: Shared<'_>) -> Result<Settings, String> {
    state.db.dismiss_setup()
}
#[tauri::command]
pub fn data_location(state: Shared<'_>) -> String {
    state.data_dir.to_string_lossy().into()
}
#[tauri::command]
pub fn save_settings(state: Shared<'_>, mut settings: Settings) -> Result<Settings, String> {
    if !["system", "none", "manual"].contains(&settings.proxy_mode.as_str()) {
        return Err("无效代理模式".into());
    }
    if settings.proxy_mode == "manual" {
        let u = url::Url::parse(&settings.proxy_url).map_err(|_| "代理地址无效")?;
        if !["http", "https", "socks5", "socks5h"].contains(&u.scheme())
            || !u.username().is_empty()
            || u.password().is_some()
        {
            return Err("请使用不含账号密码的 HTTP / SOCKS5 代理地址".into());
        }
    }
    if !settings.comfy_root.trim().is_empty() {
        (settings.comfy_root, settings.lora_dir) =
            crate::services::workspace::bind(&settings.comfy_root)?;
    } else {
        // Keep legacy custom directories until the user explicitly binds a root.
        settings.lora_dir = state.db.settings().lora_dir;
    }
    settings.output_dir = crate::services::outputs::validate_override(&settings.output_dir)?;
    state.db.put("settings", "main", &settings)?;
    Ok(settings)
}
#[tauri::command]
pub async fn save_token(token: String) -> Result<(), String> {
    auth::save_manual(&token).await
}
#[tauri::command]
pub async fn has_token() -> Result<bool, String> {
    Ok(auth::status().await?.has_token)
}
#[tauri::command]
pub async fn auth_status() -> Result<auth::AuthStatus, String> {
    auth::status().await
}
#[tauri::command]
pub async fn start_login(state: Shared<'_>) -> Result<auth::LoginStart, String> {
    auth::start(&state.db.settings()).await
}
#[tauri::command]
pub async fn poll_login(state: Shared<'_>, session_id: String) -> Result<auth::LoginPoll, String> {
    auth::poll(&state.db.settings(), &session_id).await
}
#[tauri::command]
pub async fn cancel_login(session_id: String) {
    auth::cancel(&session_id).await
}
#[tauri::command]
pub async fn get_base_models(
    state: Shared<'_>,
    force_refresh: Option<bool>,
) -> Result<Vec<String>, String> {
    let settings = state.db.settings();
    crate::services::classification_cache::get(&state.db, force_refresh.unwrap_or(false), || {
        site::base_models(&settings)
    })
    .await
}
#[tauri::command]
pub async fn get_model_tags(state: Shared<'_>, query: String) -> Result<Vec<String>, String> {
    site::model_tags(&state.db.settings(), query).await
}
#[tauri::command]
pub async fn search_models(
    state: Shared<'_>,
    query: String,
    base_model: String,
    tag: Option<String>,
    sort: String,
    cursor: Option<String>,
) -> Result<SearchResult, String> {
    if !["Highest Rated", "Most Downloaded", "Newest"].contains(&sort.as_str()) {
        return Err("不支持的排序方式".into());
    }
    site::search(
        &state.db.settings(),
        query,
        base_model,
        tag.unwrap_or_default(),
        sort,
        cursor,
    )
    .await
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Resolved {
    model: RemoteModel,
    version_id: u64,
    file_id: Option<u64>,
}
#[tauri::command]
pub async fn resolve_link(state: Shared<'_>, link: String) -> Result<Resolved, String> {
    let (model, version_id) = site::resolve(&state.db.settings(), &link).await?;
    let file_id = url::Url::parse(link.trim())
        .ok()
        .and_then(|u| {
            u.query_pairs()
                .find(|(k, _)| k == "fileId")
                .map(|(_, v)| v.to_string())
        })
        .map(|v| v.parse::<u64>().map_err(|_| "文件编号无效"))
        .transpose()?;
    if let Some(id) = file_id {
        if !model
            .versions
            .iter()
            .find(|v| v.id == version_id)
            .is_some_and(|v| v.files.iter().any(|f| f.id == id))
        {
            return Err("下载链接中的文件不属于该版本".into());
        }
    }
    Ok(Resolved {
        model,
        version_id,
        file_id,
    })
}
#[tauri::command]
pub async fn model_details(state: Shared<'_>, id: u64) -> Result<RemoteModel, String> {
    site::get_model(&state.db.settings(), id).await
}
#[tauri::command]
pub async fn add_local_model(
    state: Shared<'_>,
    app: tauri::AppHandle,
    input: storage::LocalModelInput,
) -> Result<LibraryEntry, String> {
    let entry = storage::add_local_model(&state, input).await?;
    let _ = app.emit("library-changed", ());
    Ok(entry)
}
#[tauri::command]
pub fn list_library(state: Shared<'_>) -> Result<Vec<LibraryEntry>, String> {
    let mut entries = state.db.list::<LibraryEntry>("library")?;
    for e in &mut entries {
        let missing = !Path::new(&e.path).is_file();
        if e.missing != missing {
            e.missing = missing;
            state.db.put("library", &e.id, e)?;
        }
    }
    Ok(entries)
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntryEdit {
    pub name: String,
    pub trigger_words: Option<Vec<String>>,
    pub base_model: String,
    pub tags: Vec<String>,
    pub notes: String,
    pub favorite: bool,
}
#[tauri::command]
pub fn update_entry(
    state: Shared<'_>,
    app: tauri::AppHandle,
    id: String,
    edit: EntryEdit,
) -> Result<LibraryEntry, String> {
    if edit.name.trim().is_empty() {
        return Err("名称不能为空".into());
    }
    let mut e: LibraryEntry = state.db.get("library", &id)?;
    e.name = edit.name.trim().into();
    if let Some(words) = edit.trigger_words {
        e.trigger_words = storage::normalize_trigger_words(words);
    }
    e.base_model = edit.base_model;
    e.tags = edit
        .tags
        .into_iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    e.notes = edit.notes;
    e.favorite = edit.favorite;
    state.db.put("library", &id, &e)?;
    let _ = app.emit("library-changed", ());
    Ok(e)
}
#[tauri::command]
pub async fn remove_entry(
    state: Shared<'_>,
    app: tauri::AppHandle,
    id: String,
    delete_file: bool,
) -> Result<(), String> {
    let entry: LibraryEntry = state.db.get("library", &id)?;
    if delete_file && Path::new(&entry.path).exists() {
        let p = entry.path.clone();
        tokio::task::spawn_blocking(move || {
            trash::delete(p).map_err(|e| format!("无法移入回收站，记录已保留：{e}"))
        })
        .await
        .map_err(|e| e.to_string())??;
    }
    state.db.remove("library", &id)?;
    let _ = app.emit("library-changed", ());
    Ok(())
}
#[tauri::command]
pub async fn refresh_entry(
    state: Shared<'_>,
    app: tauri::AppHandle,
    id: String,
) -> Result<LibraryEntry, String> {
    let e: LibraryEntry = state.db.get("library", &id)?;
    let version_id = e
        .version
        .as_ref()
        .map(|v| v.id)
        .ok_or("请先绑定网站模型版本")?;
    let result = storage::bind(
        &state,
        &id,
        &format!("https://civitai.red/api/download/models/{version_id}"),
    )
    .await?;
    let _ = app.emit("library-changed", ());
    Ok(result)
}
#[tauri::command]
pub async fn bind_entry(
    state: Shared<'_>,
    app: tauri::AppHandle,
    id: String,
    link: String,
) -> Result<LibraryEntry, String> {
    let e = storage::bind(&state, &id, &link).await?;
    let _ = app.emit("library-changed", ());
    Ok(e)
}
#[tauri::command]
pub async fn cache_cover(state: Shared<'_>, url: String) -> Result<Cover, String> {
    storage::cache_image(&state, &url).await
}
#[tauri::command]
pub async fn set_cover(
    state: Shared<'_>,
    app: tauri::AppHandle,
    id: String,
    mode: String,
    value: String,
) -> Result<LibraryEntry, String> {
    let initial: LibraryEntry = state.db.get("library", &id)?;
    let cover = match mode.as_str() {
        "local" => storage::import_image(&state, &value).await?,
        "remote" => {
            let source = initial
                .version
                .as_ref()
                .and_then(|v| v.images.iter().find(|c| c.url == value))
                .ok_or("请选择该版本的封面图片")?;
            storage::cache_preview(&state, source).await?
        }
        "reset" => {
            if let Some(c) = initial.version.as_ref().and_then(|v| v.images.first()) {
                storage::cache_preview(&state, c).await.unwrap_or(c.clone())
            } else {
                Cover::default()
            }
        }
        _ => return Err("未知的封面操作".into()),
    };
    let mut latest: LibraryEntry = state.db.get("library", &id)?;
    latest.cover = cover;
    latest.custom_cover = mode != "reset";
    state.db.put("library", &id, &latest)?;
    let _ = app.emit("library-changed", ());
    Ok(latest)
}
#[tauri::command]
pub async fn save_trigger_preview(
    state: Shared<'_>,
    app: tauri::AppHandle,
    entry_id: String,
    input: crate::services::trigger_previews::PreviewInput,
) -> Result<LibraryEntry, String> {
    let entry = crate::services::trigger_previews::save(&state, &entry_id, input).await?;
    let _ = app.emit("library-changed", ());
    Ok(entry)
}
#[tauri::command]
pub fn delete_trigger_preview(
    state: Shared<'_>,
    app: tauri::AppHandle,
    entry_id: String,
    preview_id: String,
) -> Result<LibraryEntry, String> {
    let entry = crate::services::trigger_previews::remove(&state, &entry_id, &preview_id)?;
    let _ = app.emit("library-changed", ());
    Ok(entry)
}
#[tauri::command]
pub fn list_recipes(state: Shared<'_>, owner: Option<String>) -> Result<Vec<Recipe>, String> {
    Ok(state
        .db
        .list::<Recipe>("recipes")?
        .into_iter()
        .filter(|r| owner.as_ref().is_none_or(|v| r.owner == *v))
        .collect())
}
#[tauri::command]
pub fn save_recipe(state: Shared<'_>, mut recipe: Recipe) -> Result<Recipe, String> {
    if recipe.name.trim().is_empty() {
        return Err("配方名称不能为空".into());
    }
    if !recipe.model_weight.is_finite()
        || !recipe.clip_weight.is_finite()
        || recipe.model_weight.abs() > 20.0
        || recipe.clip_weight.abs() > 20.0
    {
        return Err("权重必须为 -20 到 20 之间的数字".into());
    }
    if !recipe.owner.starts_with("version:") && !recipe.owner.starts_with("local:") {
        return Err("配方缺少模型关联".into());
    }
    if recipe.id.is_empty() {
        recipe.id = uuid::Uuid::new_v4().to_string()
    }
    state.db.put("recipes", &recipe.id, &recipe)?;
    Ok(recipe)
}
#[tauri::command]
pub fn delete_recipe(state: Shared<'_>, id: String) -> Result<(), String> {
    state.db.remove("recipes", &id)
}
#[tauri::command]
pub fn list_downloads(state: Shared<'_>) -> Result<Vec<DownloadTask>, String> {
    state.db.list("downloads")
}
#[tauri::command]
pub async fn enqueue_download(
    state: Shared<'_>,
    app: tauri::AppHandle,
    model_id: u64,
    version_id: u64,
    file_id: u64,
) -> Result<DownloadTask, String> {
    downloads::enqueue(state.inner().clone(), app, model_id, version_id, file_id).await
}
#[tauri::command]
pub fn control_download(
    state: Shared<'_>,
    app: tauri::AppHandle,
    id: String,
    action: String,
) -> Result<(), String> {
    downloads::control(state.inner().clone(), app, id, action)
}
#[tauri::command]
pub fn scan_library(state: Shared<'_>, app: tauri::AppHandle) -> Result<(), String> {
    storage::start_scan(state.inner().clone(), app)
}
