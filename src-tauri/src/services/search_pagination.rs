use crate::types::SearchResult;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{collections::HashSet, future::Future, time::Duration};
use url::Url;

const PAGE_SIZE: usize = 24;
pub const BATCH_SIZE: usize = 100;
const MAX_BATCHES: usize = 8;
const CURSOR_PREFIX: &str = "lora-search-v1:";

// Resume within a batch by requesting the same upstream cursor again. This keeps
// overflow out of global state, so previous-page navigation and filter changes
// cannot consume another search's buffered models.
#[derive(Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Position {
    upstream: Option<String>,
    skip: usize,
}

impl Position {
    fn decode(cursor: Option<String>) -> Result<Self, String> {
        let Some(cursor) = cursor else {
            return Ok(Self::default());
        };
        if cursor.len() > 4096 {
            return Err("搜索游标无效，请重新搜索".into());
        }
        if let Some(value) = cursor.strip_prefix(CURSOR_PREFIX) {
            let position: Self =
                serde_json::from_str(value).map_err(|_| "搜索游标无效，请重新搜索".to_string())?;
            if position.skip >= BATCH_SIZE {
                return Err("搜索游标无效，请重新搜索".into());
            }
            Ok(position)
        } else {
            Ok(Self {
                upstream: Some(cursor),
                skip: 0,
            })
        }
    }

    fn encode(&self) -> String {
        format!("{CURSOR_PREFIX}{}", serde_json::to_string(self).unwrap())
    }
}

fn next_cursor(value: &Value) -> Option<String> {
    value["metadata"]["nextCursor"]
        .as_str()
        .filter(|s| !s.is_empty())
        .map(String::from)
        .or_else(|| {
            value["metadata"]["nextCursor"]
                .as_u64()
                .map(|n| n.to_string())
        })
        .or_else(|| {
            let url = Url::parse(value["metadata"]["nextPage"].as_str()?).ok()?;
            url.query_pairs()
                .find(|(key, value)| key == "cursor" && !value.is_empty())
                .map(|(_, value)| value.into_owned())
        })
}

pub async fn collect<F, Fut>(cursor: Option<String>, mut fetch: F) -> Result<SearchResult, String>
where
    F: FnMut(Option<String>) -> Fut,
    Fut: Future<Output = Result<Value, String>>,
{
    let mut position = Position::decode(cursor)?;
    let mut items = Vec::new();
    let mut ids = HashSet::new();
    let mut visited = HashSet::new();
    let deadline = tokio::time::Instant::now() + Duration::from_secs(30);
    for _ in 0..MAX_BATCHES {
        if !visited.insert(position.upstream.clone()) {
            return Err("网站返回重复的搜索游标，请重新搜索".into());
        }
        let value = tokio::time::timeout_at(deadline, fetch(position.upstream.clone()))
            .await
            .map_err(|_| "搜索请求超时，请重试".to_string())??;
        let batch = value["items"]
            .as_array()
            .ok_or("网站未返回有效的模型列表")?;
        let next = next_cursor(&value);
        if next
            .as_ref()
            .is_some_and(|n| visited.contains(&Some(n.clone())))
        {
            return Err("网站返回重复的搜索游标，请重新搜索".into());
        }
        for (index, raw) in batch.iter().enumerate().skip(position.skip) {
            let model = super::site::model(raw);
            if ids.insert(model.id) {
                items.push(model);
            }
            if items.len() == PAGE_SIZE {
                let next_cursor = if index + 1 < batch.len() {
                    Some(
                        Position {
                            upstream: position.upstream,
                            skip: index + 1,
                        }
                        .encode(),
                    )
                } else {
                    next.map(|upstream| {
                        Position {
                            upstream: Some(upstream),
                            skip: 0,
                        }
                        .encode()
                    })
                };
                return Ok(SearchResult { items, next_cursor });
            }
        }
        let Some(upstream) = next else {
            return Ok(SearchResult {
                items,
                next_cursor: None,
            });
        };
        position = Position {
            upstream: Some(upstream),
            skip: 0,
        };
    }
    // A sparse filtered result may need more than eight requests. Preserve the
    // position even for an empty page; the UI must allow continuing the search.
    Ok(SearchResult {
        items,
        next_cursor: Some(position.encode()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn batch(ids: impl IntoIterator<Item = u64>, next: Option<&str>) -> Value {
        json!({"items": ids.into_iter().map(|id| json!({"id": id})).collect::<Vec<_>>(),
            "metadata": {"nextCursor": next}})
    }

    // Opt-in network regression. Uses public access and never reads user settings
    // or credentials. Site contents may change; not part of the offline suite.
    #[tokio::test]
    #[ignore = "requires live civitai.red access"]
    async fn live_frontline_anima() {
        let settings = crate::types::Settings {
            proxy_mode: "none".into(),
            ..Default::default()
        };
        let client = super::super::site::client(&settings).unwrap();
        let result = collect(None, |cursor| {
            let client = client.clone();
            async move {
                let mut params = vec![
                    ("limit", BATCH_SIZE.to_string()),
                    ("types", "LORA".into()),
                    ("query", "frontline".into()),
                    ("baseModels", "Anima".into()),
                    ("sort", "Most Downloaded".into()),
                    ("nsfw", "true".into()),
                ];
                if let Some(cursor) = cursor {
                    params.push(("cursor", cursor));
                }
                client
                    .get(format!("{}/api/v1/models", super::super::site::ORIGIN))
                    .query(&params)
                    .send()
                    .await
                    .map_err(|e| e.to_string())?
                    .error_for_status()
                    .map_err(|e| e.to_string())?
                    .json::<Value>()
                    .await
                    .map_err(|e| e.to_string())
            }
        })
        .await
        .unwrap();
        let ids: Vec<_> = result.items.iter().map(|m| m.id).collect();
        println!(
            "Live Anima search: {} models, has more: {}, ids: {:?}",
            ids.len(),
            result.next_cursor.is_some(),
            ids
        );
        for id in [1808992, 2053356, 2033432] {
            assert!(ids.contains(&id), "missing model {id}");
        }
    }

    #[tokio::test]
    async fn sparse_and_empty_batches_do_not_end_search() {
        let result = collect(None, |cursor| async move {
            Ok(match cursor.as_deref() {
                None => batch([1], Some("100")),
                Some("100") => batch([], Some("200")),
                Some("200") => batch([2, 3], None),
                _ => panic!("unexpected cursor"),
            })
        })
        .await
        .unwrap();
        assert_eq!(
            result.items.iter().map(|m| m.id).collect::<Vec<_>>(),
            [1, 2, 3]
        );
        assert!(result.next_cursor.is_none());
    }

    #[tokio::test]
    async fn overflow_and_previous_page_replay_lose_no_models() {
        let fetch = |_: Option<String>| async { Ok(batch(1..=100, None)) };
        let mut cursor = None;
        let mut ids = Vec::new();
        loop {
            let result = collect(cursor, fetch).await.unwrap();
            assert!(result.items.len() <= PAGE_SIZE);
            ids.extend(result.items.iter().map(|m| m.id));
            cursor = result.next_cursor;
            if cursor.is_none() {
                break;
            }
        }
        assert_eq!(ids, (1..=100).collect::<Vec<_>>());
        let first = collect(None, fetch).await.unwrap();
        assert_eq!(first.items[0].id, 1);
        assert_eq!(first.items.len(), 24);
    }

    #[tokio::test]
    async fn budget_preserves_continuation_and_failure_is_not_success() {
        let mut calls = 0;
        let result = collect(None, |cursor| {
            calls += 1;
            let next = cursor.unwrap_or_default().parse::<u64>().unwrap_or(0) + 100;
            async move { Ok(batch([], Some(&next.to_string()))) }
        })
        .await
        .unwrap();
        assert_eq!(calls, MAX_BATCHES);
        assert_eq!(
            Position::decode(result.next_cursor)
                .unwrap()
                .upstream
                .as_deref(),
            Some("800")
        );
        assert!(collect(None, |cursor| async move {
            match cursor {
                None => Ok(batch([1], Some("100"))),
                Some(_) => Err("network failed".into()),
            }
        })
        .await
        .is_err());
    }

    #[tokio::test]
    async fn bad_responses_and_cursor_cycles_are_errors() {
        assert!(
            collect(None, |_| async { Ok(json!({"error": "bad response"})) })
                .await
                .is_err()
        );
        assert!(
            collect(Some("100".into()), |_| async { Ok(batch([], Some("100"))) })
                .await
                .is_err()
        );
        assert!(Position::decode(Some(format!(
            "{CURSOR_PREFIX}{{\"upstream\":null,\"skip\":100}}"
        )))
        .is_err());
    }

    #[test]
    fn numeric_and_url_cursors_are_supported_without_following_urls() {
        assert_eq!(
            next_cursor(&json!({"metadata":{"nextCursor":100}})).as_deref(),
            Some("100")
        );
        assert_eq!(next_cursor(&json!({"metadata":{"nextPage":"https://civitai.red/api/v1/models?cursor=abc%2B123"}})).as_deref(), Some("abc+123"));
        assert_eq!(
            next_cursor(
                &json!({"metadata":{"nextPage":"https://civitai.red/api/v1/models?page=2"}})
            ),
            None
        );
    }
}
