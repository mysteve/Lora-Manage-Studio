use crate::persistence::db::Database;
use serde::{Deserialize, Serialize};
use std::{
    future::Future,
    time::{SystemTime, UNIX_EPOCH},
};

const TTL: u64 = 3 * 24 * 60 * 60;
const KEY: &str = "civitai-base-models-v1";
static LOAD: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

#[derive(Serialize, Deserialize)]
struct CachedModels {
    fetched_at: u64,
    models: Vec<String>,
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

pub async fn get<F, Fut>(
    db: &Database,
    force_refresh: bool,
    fetch: F,
) -> Result<Vec<String>, String>
where
    F: FnOnce() -> Fut,
    Fut: Future<Output = Result<Vec<String>, String>>,
{
    // 合并并发的自动加载，避免首次进入页面时重复请求。
    let _guard = LOAD.lock().await;
    if !force_refresh {
        if let Ok(cached) = db.get::<CachedModels>("settings", KEY) {
            if !cached.models.is_empty()
                && now()
                    .checked_sub(cached.fetched_at)
                    .is_some_and(|age| age < TTL)
            {
                return Ok(cached.models);
            }
        }
    }
    let models = fetch().await?;
    if models.is_empty() {
        return Err("网站返回的基础模型分类列表为空，请稍后重试".into());
    }
    db.put(
        "settings",
        KEY,
        &CachedModels {
            fetched_at: now(),
            models: models.clone(),
        },
    )?;
    Ok(models)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn cache_persists_and_manual_refresh_bypasses_it() {
        let path = std::env::temp_dir().join(format!("classification-{}.db", uuid::Uuid::new_v4()));
        {
            let db = Database::open(&path).unwrap();
            assert_eq!(
                get(&db, false, || async { Ok(vec!["SDXL".into()]) })
                    .await
                    .unwrap(),
                ["SDXL"]
            );
        }
        {
            let db = Database::open(&path).unwrap();
            assert_eq!(
                get(&db, false, || async { panic!("有效缓存不应联网") })
                    .await
                    .unwrap(),
                ["SDXL"]
            );
            assert_eq!(
                get(&db, true, || async { Ok(vec!["Flux".into()]) })
                    .await
                    .unwrap(),
                ["Flux"]
            );
            assert!(get(&db, true, || async { Err("离线".into()) })
                .await
                .is_err());
            assert_eq!(
                get(&db, false, || async { panic!("失败不能覆盖缓存") })
                    .await
                    .unwrap(),
                ["Flux"]
            );
        }
        let _ = std::fs::remove_file(path);
    }

    #[tokio::test]
    async fn expired_and_future_timestamps_require_fetch() {
        let db = Database::open(std::path::Path::new(":memory:")).unwrap();
        for fetched_at in [now() - TTL, now() + TTL] {
            db.put(
                "settings",
                KEY,
                &CachedModels {
                    fetched_at,
                    models: vec!["old".into()],
                },
            )
            .unwrap();
            assert_eq!(
                get(&db, false, || async { Ok(vec!["new".into()]) })
                    .await
                    .unwrap(),
                ["new"]
            );
        }
        db.put(
            "settings",
            KEY,
            &CachedModels {
                fetched_at: now() - TTL + 60,
                models: vec!["fresh".into()],
            },
        )
        .unwrap();
        assert_eq!(
            get(&db, false, || async { panic!("三天内应使用缓存") })
                .await
                .unwrap(),
            ["fresh"]
        );
    }
}
