use super::site;
use crate::types::Settings;
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tokio::sync::Mutex;

const AUTH_ORIGIN: &str = "https://auth.civitai.com";
const OAUTH_PREFIX: &str = "lora-oauth:";
static SESSION: Mutex<Option<DeviceSession>> = Mutex::const_new(None);
static CREDENTIALS: Mutex<()> = Mutex::const_new(());

struct DeviceSession {
    id: String,
    client_id: String,
    device_code: String,
    expires: Instant,
    next_poll: Instant,
    interval: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthStatus {
    pub has_token: bool,
    pub oauth_configured: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginStart {
    session_id: String,
    user_code: String,
    verification_url: String,
    expires_in: u64,
    interval: u64,
}

#[derive(Serialize)]
pub struct LoginPoll {
    complete: bool,
    interval: u64,
}

#[derive(Deserialize)]
struct DeviceResponse {
    device_code: String,
    user_code: String,
    expires_in: u64,
    interval: u64,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: String,
    expires_in: u64,
    token_type: String,
}

#[derive(Serialize, Deserialize)]
struct OAuthCredential {
    access_token: String,
    refresh_token: String,
    expires_at: u64,
    client_id: String,
}

fn client_id() -> Option<String> {
    std::env::var("LORA_STUDIO_OAUTH_CLIENT_ID")
        .ok()
        .or_else(|| option_env!("LORA_STUDIO_OAUTH_CLIENT_ID").map(str::to_owned))
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn read_credential() -> Result<Option<String>, String> {
    match site::token_entry()?.get_password() {
        Ok(value) => Ok((!value.is_empty()).then_some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err("无法读取 Windows 凭据，请重试".into()),
    }
}

pub async fn status() -> Result<AuthStatus, String> {
    let _guard = CREDENTIALS.lock().await;
    Ok(AuthStatus {
        has_token: read_credential()?.is_some(),
        oauth_configured: client_id().is_some(),
    })
}

pub async fn save_manual(value: &str) -> Result<(), String> {
    let value = value.trim();
    if value.starts_with(OAUTH_PREFIX) || value.chars().any(|c| c.is_whitespace() || c.is_control())
    {
        return Err("请输入完整的 API 密钥，不要包含空格或换行".into());
    }
    let mut session = SESSION.lock().await;
    let _guard = CREDENTIALS.lock().await;
    let entry = site::token_entry()?;
    if value.is_empty() {
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => {}
            Err(_) => return Err("无法清除凭据".into()),
        }
    } else {
        entry
            .set_password(value)
            .map_err(|_| "无法保存到 Windows 凭据存储".to_string())?;
    }
    *session = None;
    Ok(())
}

async fn request(
    settings: &Settings,
    endpoint: &str,
    fields: &[(&str, &str)],
) -> Result<(u16, serde_json::Value), String> {
    let response = site::client_with_redirect(settings, reqwest::redirect::Policy::none())?
        .post(format!("{AUTH_ORIGIN}/api/auth/oauth/{endpoint}"))
        .form(fields)
        .timeout(Duration::from_secs(30))
        .send()
        .await
        .map_err(site::network_error)?;
    let status = response.status().as_u16();
    let data = response
        .json()
        .await
        .map_err(|_| "授权服务返回了无效响应，请稍后重试".to_string())?;
    Ok((status, data))
}

fn response_error(status: u16, data: &serde_json::Value) -> String {
    match data.get("error").and_then(|value| value.as_str()) {
        Some("access_denied") => "已拒绝授权，可重新登录或手动输入 API 密钥",
        Some("expired_token") => "登录授权已过期，请重新登录",
        Some("invalid_client") => "OAuth 应用配置无效，请检查 Client ID",
        Some("invalid_scope") => "OAuth 应用未启用所需的读取权限，请检查应用配置",
        Some("invalid_grant") => "登录凭据已失效，请重新登录",
        _ if status == 429 => "授权请求过于频繁，请稍后重试",
        _ => "网站授权失败，请重试或手动输入 API 密钥",
    }
    .into()
}

fn credential(response: TokenResponse, client_id: String) -> Result<OAuthCredential, String> {
    if response.access_token.is_empty()
        || response.refresh_token.is_empty()
        || response.expires_in == 0
        || !response.token_type.eq_ignore_ascii_case("bearer")
    {
        return Err("授权服务返回了不完整的凭据，请重新登录".into());
    }
    Ok(OAuthCredential {
        access_token: response.access_token,
        refresh_token: response.refresh_token,
        expires_at: now().saturating_add(response.expires_in),
        client_id,
    })
}

fn store_oauth(value: &OAuthCredential) -> Result<(), String> {
    let encoded = serde_json::to_string(value).map_err(|_| "无法保存授权凭据".to_string())?;
    site::token_entry()?
        .set_password(&format!("{OAUTH_PREFIX}{encoded}"))
        .map_err(|_| "无法保存到 Windows 凭据存储".into())
}

pub async fn token(settings: &Settings) -> Result<Option<String>, String> {
    let _guard = CREDENTIALS.lock().await;
    let Some(raw) = read_credential()? else {
        return Ok(None);
    };
    let Some(encoded) = raw.strip_prefix(OAUTH_PREFIX) else {
        return Ok(Some(raw));
    };
    let saved: OAuthCredential = serde_json::from_str(encoded)
        .map_err(|_| "保存的授权凭据无法读取，请重新登录".to_string())?;
    if saved.expires_at > now().saturating_add(60) {
        return Ok(Some(saved.access_token));
    }
    let (status, data) = request(
        settings,
        "token",
        &[
            ("grant_type", "refresh_token"),
            ("refresh_token", &saved.refresh_token),
            ("client_id", &saved.client_id),
        ],
    )
    .await?;
    if !(200..300).contains(&status) {
        return Err(response_error(status, &data));
    }
    let response =
        serde_json::from_value(data).map_err(|_| "授权续期失败，请重新登录".to_string())?;
    let updated = credential(response, saved.client_id)?;
    store_oauth(&updated)?;
    Ok(Some(updated.access_token))
}

pub async fn start(settings: &Settings) -> Result<LoginStart, String> {
    let client_id = client_id().ok_or("尚未配置 OAuth Client ID，请先使用手动输入")?;
    let mut session = SESSION.lock().await;
    let (status, data) = request(
        settings,
        "device",
        &[("client_id", &client_id), ("scope", "37")],
    )
    .await?;
    if !(200..300).contains(&status) {
        return Err(response_error(status, &data));
    }
    let response: DeviceResponse =
        serde_json::from_value(data).map_err(|_| "无法读取登录授权信息，请重试".to_string())?;
    if response.device_code.is_empty()
        || response.user_code.is_empty()
        || response.expires_in == 0
        || response.expires_in > 3600
        || response.interval > 3600
    {
        return Err("登录授权信息无效，请重试".into());
    }
    let interval = response.interval.max(5);
    let session_id = uuid::Uuid::new_v4().to_string();
    let mut url = url::Url::parse(&format!("{AUTH_ORIGIN}/login/oauth/device"))
        .map_err(|_| "登录地址无效".to_string())?;
    url.query_pairs_mut()
        .append_pair("code", &response.user_code);
    *session = Some(DeviceSession {
        id: session_id.clone(),
        client_id,
        device_code: response.device_code,
        expires: Instant::now() + Duration::from_secs(response.expires_in),
        next_poll: Instant::now() + Duration::from_secs(interval),
        interval,
    });
    Ok(LoginStart {
        session_id,
        user_code: response.user_code,
        verification_url: url.into(),
        expires_in: response.expires_in,
        interval,
    })
}

pub async fn cancel(id: &str) {
    let mut session = SESSION.lock().await;
    if session.as_ref().is_some_and(|value| value.id == id) {
        *session = None;
    }
}

pub async fn poll(settings: &Settings, id: &str) -> Result<LoginPoll, String> {
    let mut session = SESSION.lock().await;
    let active = session
        .as_mut()
        .filter(|value| value.id == id)
        .ok_or("登录已取消，请重新登录")?;
    if Instant::now() >= active.expires {
        *session = None;
        return Err("登录授权已过期，请重新登录".into());
    }
    if Instant::now() < active.next_poll {
        return Ok(LoginPoll {
            complete: false,
            interval: active.interval,
        });
    }
    active.next_poll = Instant::now() + Duration::from_secs(active.interval);
    let (status, data) = request(
        settings,
        "device-token",
        &[
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
            ("device_code", &active.device_code),
            ("client_id", &active.client_id),
        ],
    )
    .await?;
    let error = data.get("error").and_then(|value| value.as_str());
    if status == 429 || error == Some("slow_down") {
        active.interval = active.interval.saturating_add(5);
        active.next_poll = Instant::now() + Duration::from_secs(active.interval);
        return Ok(LoginPoll {
            complete: false,
            interval: active.interval,
        });
    }
    if error == Some("authorization_pending") {
        return Ok(LoginPoll {
            complete: false,
            interval: active.interval,
        });
    }
    if !(200..300).contains(&status) {
        *session = None;
        return Err(response_error(status, &data));
    }
    let response =
        serde_json::from_value(data).map_err(|_| "无法读取授权凭据，请重新登录".to_string())?;
    let saved = credential(response, active.client_id.clone())?;
    let _guard = CREDENTIALS.lock().await;
    store_oauth(&saved)?;
    *session = None;
    Ok(LoginPoll {
        complete: true,
        interval: 0,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn sessions_enforce_interval_expiry_and_cancellation_identity() {
        *SESSION.lock().await = Some(DeviceSession {
            id: "current".into(),
            client_id: "test-client".into(),
            device_code: "test-device".into(),
            expires: Instant::now() + Duration::from_secs(900),
            next_poll: Instant::now() + Duration::from_secs(60),
            interval: 60,
        });
        let waiting = poll(&Settings::default(), "current").await.unwrap();
        assert!(!waiting.complete);
        assert_eq!(waiting.interval, 60);
        assert!(poll(&Settings::default(), "previous").await.is_err());
        cancel("previous").await;
        assert!(SESSION.lock().await.is_some());
        SESSION.lock().await.as_mut().unwrap().expires = Instant::now();
        assert!(poll(&Settings::default(), "current")
            .await
            .err()
            .unwrap()
            .contains("过期"));
        assert!(SESSION.lock().await.is_none());
        assert!(poll(&Settings::default(), "current").await.is_err());
    }

    #[test]
    fn auth_errors_never_echo_server_secrets() {
        let data = serde_json::json!({"error": "unexpected", "error_description": "secret-value", "access_token": "secret-value"});
        assert!(!response_error(500, &data).contains("secret-value"));
        assert!(
            response_error(401, &serde_json::json!({"error":"invalid_client"}))
                .contains("Client ID")
        );
    }

    #[test]
    fn rejects_incomplete_oauth_credentials() {
        assert!(credential(
            TokenResponse {
                access_token: "test".into(),
                refresh_token: "".into(),
                expires_in: 3600,
                token_type: "Bearer".into()
            },
            "client".into()
        )
        .is_err());
    }

    #[test]
    fn stores_refresh_information_with_expiry() {
        let value = credential(
            TokenResponse {
                access_token: "test".into(),
                refresh_token: "refresh".into(),
                expires_in: 3600,
                token_type: "Bearer".into(),
            },
            "client".into(),
        )
        .unwrap();
        assert!(value.expires_at >= now() + 3599);
        let restored: OAuthCredential =
            serde_json::from_str(&serde_json::to_string(&value).unwrap()).unwrap();
        assert_eq!(restored.client_id, "client");
        assert_eq!(restored.refresh_token, "refresh");
    }
}
