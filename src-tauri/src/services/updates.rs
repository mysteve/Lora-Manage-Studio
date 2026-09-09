use crate::{services::site, AppState};
use serde::{Deserialize, Serialize};
use std::{sync::Arc, time::Duration};
use tauri::State;

#[derive(Serialize, Deserialize)]
pub struct Release {
    pub tag_name: String,
}
#[tauri::command]
pub async fn check_app_update(state: State<'_, Arc<AppState>>) -> Result<Option<Release>, String> {
    let client =
        site::client_with_redirect(&state.db.settings(), reqwest::redirect::Policy::none())?;
    let response = client
        .get("https://api.github.com/repos/mysteve/Lora-Manage-Studio/releases/latest")
        .header("Accept", "application/vnd.github+json")
        .timeout(Duration::from_secs(20))
        .send()
        .await
        .map_err(site::network_error)?;
    if response.status().as_u16() == 404 {
        return Ok(None);
    }
    if !response.status().is_success() {
        return Err(match response.status().as_u16() {
            403 | 429 => "GitHub 暂时限制请求，请稍后重试，或打开发布页面查看".into(),
            status => format!("检查更新失败，HTTP {status}，请稍后重试"),
        });
    }
    let release: Release = response
        .json()
        .await
        .map_err(|_| "GitHub 返回的版本信息无法读取")?;
    if release.tag_name.trim().is_empty() {
        return Err("发布版本缺少版本号，请打开发布页面查看".into());
    }
    Ok(Some(release))
}
