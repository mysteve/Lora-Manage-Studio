use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub lora_dir: String,
    #[serde(default)]
    pub comfy_root: String,
    #[serde(default)]
    pub setup_dismissed: bool,
    pub proxy_mode: String,
    pub proxy_url: String,
    pub safe_content: bool,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            lora_dir: String::new(),
            comfy_root: String::new(),
            setup_dismissed: false,
            proxy_mode: "system".into(),
            proxy_url: String::new(),
            safe_content: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SourceFile {
    pub id: u64,
    pub name: String,
    pub size_kb: f64,
    pub download_url: String,
    pub sha256: String,
    pub format: String,
    pub primary: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Cover {
    pub url: String,
    pub local_path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub nsfw_level: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<serde_json::Value>,
}
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ModelVersion {
    pub id: u64,
    pub model_id: u64,
    pub name: String,
    pub base_model: String,
    pub description: String,
    pub trained_words: Vec<String>,
    pub files: Vec<SourceFile>,
    pub images: Vec<Cover>,
    #[serde(default)]
    pub images_classified: bool,
    pub availability: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RemoteModel {
    pub id: u64,
    pub name: String,
    pub author: String,
    pub description: String,
    pub tags: Vec<String>,
    pub downloads: u64,
    pub versions: Vec<ModelVersion>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub items: Vec<RemoteModel>,
    pub next_cursor: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TriggerPreview {
    pub id: String,
    pub name: String,
    pub trigger_words: Vec<String>,
    pub image: Cover,
    pub notes: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LibraryEntry {
    pub id: String,
    pub path: String,
    pub size: u64,
    pub modified: u64,
    pub sha256: String,
    pub name: String,
    #[serde(default)]
    pub trigger_words: Vec<String>,
    #[serde(default)]
    pub trigger_previews: Vec<TriggerPreview>,
    pub author: String,
    pub base_model: String,
    pub tags: Vec<String>,
    pub notes: String,
    pub favorite: bool,
    pub missing: bool,
    pub verified: bool,
    pub cover: Cover,
    pub custom_cover: bool,
    pub model_id: Option<u64>,
    pub version: Option<ModelVersion>,
    pub created_at: u64,
}
impl LibraryEntry {
    pub fn recipe_owner(&self) -> String {
        self.version
            .as_ref()
            .map(|v| format!("version:{}", v.id))
            .unwrap_or_else(|| format!("local:{}", self.id))
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Recipe {
    pub id: String,
    pub owner: String,
    pub name: String,
    pub positive: String,
    pub negative: String,
    pub model_weight: f64,
    pub clip_weight: f64,
    pub notes: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadTask {
    pub id: String,
    pub model: RemoteModel,
    pub version: ModelVersion,
    pub file: SourceFile,
    pub destination: String,
    pub status: String,
    pub downloaded: u64,
    pub total: u64,
    pub speed: f64,
    pub error: String,
    pub created_at: u64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgress {
    pub running: bool,
    pub processed: u64,
    pub matched: u64,
    pub current: String,
    pub errors: Vec<String>,
}
pub fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
