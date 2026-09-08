use crate::types::*;
use reqwest::{Client, StatusCode};
use serde_json::Value;
use std::time::Duration;
use url::Url;

pub const ORIGIN: &str = "https://civitai.red";
pub fn token_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new("studio.lora.desktop", "civitai-token")
        .map_err(|_| "无法访问 Windows 凭据存储".into())
}
pub fn token() -> Option<String> {
    token_entry()
        .ok()?
        .get_password()
        .ok()
        .filter(|v| !v.is_empty())
}
pub fn client(settings: &Settings) -> Result<Client, String> {
    let mut builder = Client::builder()
        .user_agent("LoRA-Studio/0.1.0")
        .connect_timeout(Duration::from_secs(20))
        .read_timeout(Duration::from_secs(60))
        .redirect(reqwest::redirect::Policy::limited(10));
    if settings.proxy_mode == "none" {
        builder = builder.no_proxy();
    }
    if settings.proxy_mode == "manual" {
        builder = builder.no_proxy().proxy(
            reqwest::Proxy::all(&settings.proxy_url).map_err(|_| "代理地址无效".to_string())?,
        );
    }
    builder.build().map_err(|_| "网络客户端初始化失败".into())
}
pub fn network_error(err: reqwest::Error) -> String {
    if err.is_timeout() {
        "网络请求超时，请检查代理或重试".into()
    } else if err.is_connect() {
        "无法连接网站，请检查网络和代理设置".into()
    } else {
        "网络传输失败，请重试".into()
    }
}
pub fn status_error(status: StatusCode) -> String {
    match status.as_u16() {
        401 => "需要 API Token 或 Token 已失效".into(),
        403 => "网站拒绝访问，请检查账号权限或代理".into(),
        404 => "模型或版本不存在，可能已下架".into(),
        429 => "网站请求过于频繁，请稍后重试".into(),
        _ => format!("网站返回错误 HTTP {}", status.as_u16()),
    }
}
pub async fn api(
    settings: &Settings,
    path: &str,
    params: &[(&str, String)],
) -> Result<Value, String> {
    let cli = client(settings)?;
    let mut req = cli
        .get(format!("{ORIGIN}{path}"))
        .query(params)
        .timeout(Duration::from_secs(45));
    if let Some(token) = token() {
        req = req.bearer_auth(token)
    }
    let resp = req.send().await.map_err(network_error)?;
    if !resp.status().is_success() {
        return Err(status_error(resp.status()));
    }
    let mut data: Value = resp
        .json()
        .await
        .map_err(|_| "网站响应不是有效的模型数据".to_string())?;
    if settings.safe_content {
        filter_safe_images(&mut data)
    }
    Ok(data)
}
fn filter_safe_images(v: &mut Value) {
    match v {
        Value::Object(map) => {
            if let Some(Value::Array(images)) = map.get_mut("images") {
                images.retain(|i| i["nsfwLevel"].as_u64().unwrap_or(1) <= 1);
            }
            for value in map.values_mut() {
                filter_safe_images(value)
            }
        }
        Value::Array(a) => {
            for v in a {
                filter_safe_images(v)
            }
        }
        _ => {}
    }
}
fn text(v: &Value, k: &str) -> String {
    v[k].as_str().unwrap_or_default().into()
}
fn strings(v: &Value) -> Vec<String> {
    v.as_array()
        .map(|a| {
            a.iter()
                .filter_map(|x| x.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default()
}
pub fn clean(html: &str) -> String {
    ammonia::Builder::default()
        .tags(std::collections::HashSet::new())
        .clean(html)
        .to_string()
}
pub fn version(v: &Value, model_id: u64) -> ModelVersion {
    ModelVersion {
        id: v["id"].as_u64().unwrap_or(0),
        model_id: v["modelId"].as_u64().unwrap_or(model_id),
        name: text(v, "name"),
        base_model: text(v, "baseModel"),
        description: clean(&text(v, "description")),
        trained_words: strings(&v["trainedWords"]),
        availability: text(v, "availability"),
        files: v["files"]
            .as_array()
            .map(|a| {
                a.iter()
                    .filter(|f| f["type"].as_str() == Some("Model"))
                    .map(|f| SourceFile {
                        id: f["id"].as_u64().unwrap_or(0),
                        name: text(f, "name"),
                        size_kb: f["sizeKB"].as_f64().unwrap_or(0.0),
                        download_url: text(f, "downloadUrl"),
                        sha256: text(&f["hashes"], "SHA256"),
                        format: text(&f["metadata"], "format"),
                        primary: f["primary"].as_bool().unwrap_or(false),
                    })
                    .collect()
            })
            .unwrap_or_default(),
        images: v["images"]
            .as_array()
            .map(|a| {
                a.iter()
                    .filter(|i| i["type"].as_str().unwrap_or("image") == "image")
                    .take(16)
                    .map(|i| Cover {
                        url: text(i, "url"),
                        local_path: String::new(),
                    })
                    .collect()
            })
            .unwrap_or_default(),
    }
}
pub fn model(v: &Value) -> RemoteModel {
    let id = v["id"].as_u64().unwrap_or(0);
    RemoteModel {
        id,
        name: text(v, "name"),
        author: text(&v["creator"], "username"),
        description: clean(&text(v, "description")),
        tags: strings(&v["tags"]),
        downloads: v["stats"]["downloadCount"].as_u64().unwrap_or(0),
        versions: v["modelVersions"]
            .as_array()
            .map(|a| a.iter().map(|v| version(v, id)).collect())
            .unwrap_or_default(),
    }
}
pub async fn get_model(settings: &Settings, id: u64) -> Result<RemoteModel, String> {
    let v = api(settings, &format!("/api/v1/models/{id}"), &[]).await?;
    if !["LORA", "LoCon"].contains(&v["type"].as_str().unwrap_or("")) {
        return Err("该链接不是 LoRA 模型".into());
    }
    Ok(model(&v))
}
pub async fn get_version(settings: &Settings, id: u64) -> Result<ModelVersion, String> {
    let v = api(settings, &format!("/api/v1/model-versions/{id}"), &[]).await?;
    Ok(version(&v, 0))
}
#[derive(Debug, PartialEq)]
pub enum ModelLink {
    Model(u64, Option<u64>),
    Version(u64),
}
pub fn parse_link(input: &str) -> Result<ModelLink, String> {
    let url =
        Url::parse(input.trim()).map_err(|_| "请输入完整的 civitai.red 模型链接".to_string())?;
    if !["https", "http"].contains(&url.scheme())
        || ![
            "civitai.red",
            "www.civitai.red",
            "civitai.com",
            "www.civitai.com",
        ]
        .contains(&url.host_str().unwrap_or(""))
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("仅支持 civitai.red 或 civitai.com 模型链接".into());
    }
    let parts: Vec<_> = url.path_segments().into_iter().flatten().collect();
    let id = |s: &str| {
        s.parse::<u64>()
            .ok()
            .filter(|n| *n > 0)
            .ok_or_else(|| "链接中的模型编号无效".to_string())
    };
    if parts.first() == Some(&"models") && parts.len() >= 2 {
        let vid = url
            .query_pairs()
            .find(|(k, _)| k == "modelVersionId")
            .map(|(_, v)| id(&v))
            .transpose()?;
        return Ok(ModelLink::Model(id(parts[1])?, vid));
    }
    if parts.len() >= 4 && parts[..3] == ["api", "download", "models"] {
        return Ok(ModelLink::Version(id(parts[3])?));
    }
    if parts.len() == 4 && parts[..3] == ["api", "v1", "model-versions"] {
        return Ok(ModelLink::Version(id(parts[3])?));
    }
    Err("链接中未找到模型或版本编号".into())
}
pub async fn resolve(settings: &Settings, input: &str) -> Result<(RemoteModel, u64), String> {
    let (model_id, version_id) = match parse_link(input)? {
        ModelLink::Model(m, v) => (m, v),
        ModelLink::Version(v) => {
            let ver = get_version(settings, v).await?;
            (ver.model_id, Some(v))
        }
    };
    let mut m = get_model(settings, model_id).await?;
    if let Some(v) = version_id {
        if !m.versions.iter().any(|x| x.id == v) {
            let ver = get_version(settings, v).await?;
            if ver.model_id != m.id {
                return Err("版本与模型不匹配".into());
            }
            m.versions.insert(0, ver);
        }
    }
    let selected = version_id
        .or_else(|| m.versions.first().map(|v| v.id))
        .ok_or("此模型没有可用版本")?;
    Ok((m, selected))
}
pub async fn search(
    settings: &Settings,
    query: String,
    base_model: String,
    sort: String,
    cursor: Option<String>,
) -> Result<SearchResult, String> {
    let mut params = vec![
        ("limit", "24".into()),
        ("types", "LORA".into()),
        ("nsfw", (!settings.safe_content).to_string()),
        ("sort", sort),
    ];
    if !query.trim().is_empty() {
        params.push(("query", query))
    }
    if !base_model.is_empty() {
        params.push(("baseModels", base_model))
    }
    if let Some(c) = cursor {
        params.push(("cursor", c))
    }
    let v = api(settings, "/api/v1/models", &params).await?;
    let next = v["metadata"]["nextCursor"]
        .as_str()
        .map(String::from)
        .or_else(|| v["metadata"]["nextCursor"].as_u64().map(|x| x.to_string()))
        .or_else(|| {
            v["metadata"]["nextPage"]
                .as_str()
                .and_then(|s| Url::parse(s).ok())
                .and_then(|u| {
                    u.query_pairs()
                        .find(|(k, _)| k == "cursor")
                        .map(|(_, v)| v.to_string())
                })
        });
    Ok(SearchResult {
        items: v["items"]
            .as_array()
            .map(|a| a.iter().map(model).collect())
            .unwrap_or_default(),
        next_cursor: next,
    })
}
pub fn safe_download_url(input: &str) -> Result<Url, String> {
    let u = Url::parse(input).map_err(|_| "下载地址无效")?;
    if u.scheme() != "https"
        || !["civitai.red", "civitai.com"].contains(&u.host_str().unwrap_or(""))
        || !u.path().starts_with("/api/download/models/")
    {
        return Err("下载入口不是受支持的 Civitai HTTPS 地址".into());
    }
    Ok(u)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn api_errors_are_actionable() {
        assert!(status_error(StatusCode::UNAUTHORIZED).contains("Token"));
        assert!(status_error(StatusCode::FORBIDDEN).contains("权限"));
        assert!(status_error(StatusCode::TOO_MANY_REQUESTS).contains("频繁"));
    }
    #[test]
    fn safe_mode_filters_version_images() {
        let mut v = serde_json::json!({"items":[{"modelVersions":[{"images":[{"nsfwLevel":1},{"nsfwLevel":4}]}]}]});
        filter_safe_images(&mut v);
        assert_eq!(
            v["items"][0]["modelVersions"][0]["images"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
    }
    #[test]
    fn links() {
        assert_eq!(
            parse_link("https://civitai.red/models/42/demo?modelVersionId=8").unwrap(),
            ModelLink::Model(42, Some(8))
        );
        assert_eq!(
            parse_link("https://civitai.red/api/download/models/8?fileId=2").unwrap(),
            ModelLink::Version(8)
        );
        assert!(parse_link("https://civitai.red.evil.test/models/42").is_err());
        assert!(parse_link("file:///models/42").is_err());
        assert!(parse_link("https://civitai.red/models/0").is_err());
    }
    #[test]
    fn strips_active_html() {
        let s = clean("<script>alert(1)</script><b>hello</b><img src=x onerror=evil()>");
        assert!(!s.contains("script"));
        assert!(!s.contains("onerror"));
        assert!(s.contains("hello"));
    }
}
