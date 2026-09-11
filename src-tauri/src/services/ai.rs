use crate::{services::site, AppState};
use serde::{Deserialize, Serialize};
use std::{sync::Arc, time::Duration};
use tauri::State;
use url::Url;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AiConfig {
    pub provider: String,
    pub base_url: String,
    pub model: String,
}
impl Default for AiConfig {
    fn default() -> Self {
        Self {
            provider: "deepseek".into(),
            base_url: "https://api.deepseek.com".into(),
            model: String::new(),
        }
    }
}
pub(super) fn base(config: &AiConfig) -> Result<Url, String> {
    if !["deepseek", "custom"].contains(&config.provider.as_str()) {
        return Err("请选择有效的 AI 服务".into());
    }
    let url = Url::parse(config.base_url.trim().trim_end_matches('/'))
        .map_err(|_| "请输入完整的 API 地址")?;
    if !["http", "https"].contains(&url.scheme())
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err("API 地址须为 HTTP / HTTPS 地址，不能包含账号、密码、查询参数或锚点".into());
    }
    if config.provider == "deepseek"
        && url.as_str().trim_end_matches('/') != "https://api.deepseek.com"
    {
        return Err("DeepSeek 使用官方 API 地址，其他地址请选择第三方服务".into());
    }
    Ok(url)
}
fn credential(config: &AiConfig) -> Result<keyring::Entry, String> {
    let url = base(config)?;
    keyring::Entry::new("studio.lora.desktop.ai", url.as_str().trim_end_matches('/'))
        .map_err(|_| "无法访问 Windows 凭据存储".into())
}
pub(super) fn token(config: &AiConfig) -> Result<Option<String>, String> {
    match credential(config)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err("无法读取 AI 密钥".into()),
    }
}
#[tauri::command]
pub fn get_ai_config(state: State<'_, Arc<AppState>>) -> AiConfig {
    state.db.get("settings", "ai").unwrap_or_default()
}
#[tauri::command]
pub fn save_ai_config(
    state: State<'_, Arc<AppState>>,
    mut config: AiConfig,
) -> Result<AiConfig, String> {
    config.base_url = base(&config)?.as_str().trim_end_matches('/').into();
    config.model = config.model.trim().into();
    state.db.put("settings", "ai", &config)?;
    Ok(config)
}
#[tauri::command]
pub fn ai_has_token(config: AiConfig) -> Result<bool, String> {
    Ok(token(&config)?.is_some())
}
#[tauri::command]
pub fn save_ai_token(config: AiConfig, token: String) -> Result<(), String> {
    let value = token.trim();
    if value.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err("密钥不能包含空格或换行".into());
    }
    let entry = credential(&config)?;
    if value.is_empty() {
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err("无法清除 AI 密钥".into()),
        }
    } else {
        entry
            .set_password(value)
            .map_err(|_| "无法保存 AI 密钥到 Windows 凭据管理器".into())
    }
}
fn parse_models(value: serde_json::Value) -> Result<Vec<String>, String> {
    let data = value
        .get("data")
        .and_then(|v| v.as_array())
        .ok_or("服务返回的模型列表格式不兼容，需要 data 数组")?;
    let mut ids: Vec<String> = data
        .iter()
        .filter_map(|v| v.get("id").and_then(|id| id.as_str()))
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .map(str::to_owned)
        .collect();
    ids.sort();
    ids.dedup();
    if ids.is_empty() {
        return Err("服务未返回可用模型，请检查账号权限，或手动填写模型 ID".into());
    }
    Ok(ids)
}
#[tauri::command]
pub async fn list_ai_models(
    state: State<'_, Arc<AppState>>,
    config: AiConfig,
) -> Result<Vec<String>, String> {
    let settings = state.db.settings();
    fetch_models(&settings, &config, token(&config)?).await
}
async fn fetch_models(
    settings: &crate::types::Settings,
    config: &AiConfig,
    key: Option<String>,
) -> Result<Vec<String>, String> {
    let mut url = base(config)?;
    url.set_path(&format!("{}/models", url.path().trim_end_matches('/')));
    let client = site::client_with_redirect(settings, reqwest::redirect::Policy::none())?;
    let mut request = client.get(url).timeout(Duration::from_secs(30));
    if let Some(key) = key {
        request = request.bearer_auth(key);
    }
    let response = request.send().await.map_err(site::network_error)?;
    let status = response.status();
    if !status.is_success() {
        return Err(match status.as_u16() {
            401 | 403 => "认证失败，请检查当前地址的 API 密钥和模型访问权限".into(),
            404 => "未找到模型列表接口，请检查 API 地址及 /v1 前缀".into(),
            429 => "请求过于频繁，请稍后重试".into(),
            _ => format!("获取模型列表失败，HTTP {}", status.as_u16()),
        });
    }
    let value = response
        .json()
        .await
        .map_err(|_| "模型列表不是有效的 JSON")?;
    parse_models(value)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_endpoints() {
        assert!(base(&AiConfig::default()).is_ok());
        for address in [
            "file:///tmp",
            "https://user:pass@example.com",
            "https://example.com?key=secret",
            "https://example.com#x",
        ] {
            assert!(base(&AiConfig {
                provider: "custom".into(),
                base_url: address.into(),
                model: String::new()
            })
            .is_err());
        }
        assert!(base(&AiConfig {
            base_url: "https://example.com".into(),
            ..AiConfig::default()
        })
        .is_err());
        let mut url = base(&AiConfig {
            provider: "custom".into(),
            base_url: "http://localhost:1234/v1/".into(),
            model: String::new(),
        })
        .unwrap();
        url.set_path(&format!("{}/models", url.path().trim_end_matches('/')));
        assert_eq!(url.as_str(), "http://localhost:1234/v1/models");
    }
    #[test]
    fn parses_model_ids() {
        assert_eq!(
            parse_models(
                serde_json::json!({"data":[{"id":"b"},{"id":"a"},{"id":"b"},{"id":" "},{}]})
            )
            .unwrap(),
            vec!["a", "b"]
        );
        assert!(parse_models(serde_json::json!({"data":[]})).is_err());
        assert!(parse_models(serde_json::json!({"models":[]})).is_err());
    }
    #[test]
    fn config_defaults_and_roundtrip() {
        let config: AiConfig = serde_json::from_str("{}").unwrap();
        assert_eq!(config.provider, "deepseek");
        let db = crate::persistence::db::Database::open(std::path::Path::new(":memory:")).unwrap();
        db.put("settings", "ai", &config).unwrap();
        assert_eq!(
            db.get::<AiConfig>("settings", "ai").unwrap().base_url,
            config.base_url
        );
    }
    #[tokio::test]
    async fn model_request_uses_prefix_auth_and_reports_failures() {
        use std::io::{Read, Write};
        for (status, body, expected) in [
            (200, r#"{"data":[{"id":"example-model"}]}"#, None),
            (401, "secret response must not be echoed", Some("认证失败")),
            (404, "", Some("未找到")),
            (429, "", Some("过于频繁")),
            (302, "", Some("HTTP 302")),
            (200, "invalid", Some("JSON")),
        ] {
            let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
            let address = listener.local_addr().unwrap();
            let server = std::thread::spawn(move || {
                let (mut stream, _) = listener.accept().unwrap();
                stream
                    .set_read_timeout(Some(Duration::from_secs(5)))
                    .unwrap();
                let mut request = Vec::new();
                let mut buffer = [0; 1024];
                while !request.windows(4).any(|w| w == b"\r\n\r\n") {
                    let count = stream.read(&mut buffer).unwrap();
                    if count == 0 {
                        break;
                    }
                    request.extend_from_slice(&buffer[..count]);
                }
                let text = String::from_utf8(request).unwrap().to_lowercase();
                assert!(text.starts_with("get /v1/models http/1.1"));
                assert!(text.contains("authorization: bearer test-only-key"));
                write!(stream, "HTTP/1.1 {status} Test\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).unwrap();
            });
            let config = AiConfig {
                provider: "custom".into(),
                base_url: format!("http://{address}/v1/"),
                model: String::new(),
            };
            let settings = crate::types::Settings {
                proxy_mode: "none".into(),
                ..Default::default()
            };
            let result = fetch_models(&settings, &config, Some("test-only-key".into())).await;
            server.join().unwrap();
            if let Some(message) = expected {
                let error = result.unwrap_err();
                assert!(error.contains(message));
                assert!(!error.contains("secret"));
            } else {
                assert_eq!(result.unwrap(), vec!["example-model"]);
            }
        }
    }
}
