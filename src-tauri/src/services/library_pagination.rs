use crate::{
    persistence::db::Database,
    types::{LibraryEntry, LibraryPage},
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{cmp::Ordering, collections::HashSet, path::Path};

const PAGE_SIZE: usize = 60;
const MAX_CURSOR_BYTES: usize = 16 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", content = "value", deny_unknown_fields)]
enum SortKey {
    Name(String),
    Number(u64),
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Cursor {
    version: u8,
    binding: String,
    key: SortKey,
    id: String,
}

struct Request {
    query: String,
    base_model: String,
    file_status: String,
    sort: String,
    binding: String,
    cursor: Option<Cursor>,
}

// Match JavaScript String.trim(), including BOM and excluding NEL.
fn trim(value: &str) -> &str {
    value.trim_matches(|c: char| (c.is_whitespace() && c != '\u{85}') || c == '\u{feff}')
}

impl Request {
    fn new(
        query: String,
        base_model: String,
        file_status: String,
        sort: String,
        cursor: Option<String>,
    ) -> Result<Self, String> {
        if !["", "installed", "missing"].contains(&file_status.as_str()) {
            return Err("不支持的文件状态".into());
        }
        if !["newest", "name", "size"].contains(&sort.as_str()) {
            return Err("不支持的模型排序方式".into());
        }
        let query = trim(&query).to_lowercase();
        let conditions = serde_json::to_vec(&(&query, &base_model, &file_status, &sort))
            .map_err(|e| e.to_string())?;
        let binding = format!("{:x}", Sha256::digest(conditions));
        let cursor = cursor
            .map(|value| {
                if value.len() > MAX_CURSOR_BYTES {
                    return Err("模型分页游标过大".to_string());
                }
                let cursor: Cursor =
                    serde_json::from_str(&value).map_err(|_| "模型分页游标无效".to_string())?;
                if cursor.version != 1
                    || cursor.binding != binding
                    || cursor.id.is_empty()
                    || !matches!(
                        (&cursor.key, sort.as_str()),
                        (SortKey::Name(_), "name") | (SortKey::Number(_), "newest" | "size")
                    )
                {
                    return Err("模型分页条件已改变或游标无效，请重新加载".into());
                }
                Ok(cursor)
            })
            .transpose()?;
        Ok(Self {
            query,
            base_model,
            file_status,
            sort,
            binding,
            cursor,
        })
    }

    fn matches(&self, entry: &LibraryEntry) -> bool {
        if (!self.base_model.is_empty() && entry.base_model != self.base_model)
            || (self.file_status == "missing" && !entry.missing)
            || (self.file_status == "installed" && entry.missing)
        {
            return false;
        }
        // Keep field order, trigger trimming and case-insensitive deduplication
        // aligned with utils.matchesEntry/modelTriggerWords, including cross-field searches.
        let mut parts = vec![entry.name.as_str()];
        parts.extend(entry.tags.iter().map(String::as_str));
        let mut seen = HashSet::new();
        for word in entry
            .version
            .iter()
            .flat_map(|v| v.trained_words.iter())
            .chain(entry.trigger_words.iter())
        {
            let word = trim(word);
            if !word.is_empty() && seen.insert(word.to_lowercase()) {
                parts.push(word);
            }
        }
        parts.join(" ").to_lowercase().contains(&self.query)
    }

    fn key(&self, entry: &LibraryEntry) -> SortKey {
        match self.sort.as_str() {
            "name" => SortKey::Name(entry.name.clone()),
            "size" => SortKey::Number(entry.size),
            _ => SortKey::Number(entry.created_at),
        }
    }

    fn page(&self, entries: Vec<LibraryEntry>) -> Result<LibraryPage, String> {
        let mut entries: Vec<_> = entries
            .into_iter()
            .filter(|e| self.matches(e))
            .map(|e| (self.key(&e), e))
            .collect();
        let total = entries.len();
        entries.sort_by(|(a_key, a), (b_key, b)| compare(a_key, &a.id, b_key, &b.id));
        // Compare against the saved key, never locate the anchor or use an offset.
        // Deleting the anchor or inserting earlier items cannot shift the boundary.
        let mut items: Vec<_> = entries
            .into_iter()
            .filter(|(key, e)| {
                self.cursor
                    .as_ref()
                    .is_none_or(|c| compare(key, &e.id, &c.key, &c.id).is_gt())
            })
            .take(PAGE_SIZE + 1)
            .map(|(_, e)| e)
            .collect();
        let has_more = items.len() > PAGE_SIZE;
        items.truncate(PAGE_SIZE);
        let next_cursor = if has_more {
            let last = items.last().expect("a full page has a last item");
            let value = serde_json::to_string(&Cursor {
                version: 1,
                binding: self.binding.clone(),
                key: self.key(last),
                id: last.id.clone(),
            })
            .map_err(|e| e.to_string())?;
            if value.len() > MAX_CURSOR_BYTES {
                return Err("模型排序字段过长，无法生成分页游标".into());
            }
            Some(value)
        } else {
            None
        };
        Ok(LibraryPage {
            items,
            next_cursor,
            total,
        })
    }
}

fn compare(a: &SortKey, a_id: &str, b: &SortKey, b_id: &str) -> Ordering {
    let order = match (a, b) {
        (SortKey::Name(a), SortKey::Name(b)) => a.cmp(b),
        (SortKey::Number(a), SortKey::Number(b)) => b.cmp(a),
        _ => unreachable!("validated sort keys have matching types"),
    };
    order.then_with(|| a_id.cmp(b_id))
}

pub fn list(
    db: &Database,
    query: String,
    base_model: String,
    file_status: String,
    sort: String,
    cursor: Option<String>,
) -> Result<LibraryPage, String> {
    let request = Request::new(query, base_model, file_status, sort, cursor)?;
    // The current schema stores whole entries as JSON. Keep search semantics and
    // live missing detection without a schema migration; only the page crosses IPC.
    let mut entries = db.list::<LibraryEntry>("library")?;
    for entry in &mut entries {
        let missing = !Path::new(&entry.path).is_file();
        if entry.missing != missing {
            entry.missing = missing;
            db.update_library(&entry.id, |latest| {
                if latest.path == entry.path {
                    latest.missing = missing;
                }
                Ok(())
            })?;
        }
    }
    request.page(entries)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::ModelVersion;

    fn entries(n: usize) -> Vec<LibraryEntry> {
        (0..n)
            .map(|i| LibraryEntry {
                id: format!("id-{i:03}"),
                name: "same".into(),
                size: 100,
                created_at: 100,
                ..Default::default()
            })
            .collect()
    }
    fn request(sort: &str, cursor: Option<String>) -> Request {
        Request::new("".into(), "".into(), "".into(), sort.into(), cursor).unwrap()
    }

    #[test]
    fn equal_keys_page_once_and_survive_deleted_anchor_and_insertions() {
        for sort in ["name", "size", "newest"] {
            let mut data = entries(125);
            data.reverse();
            let first = request(sort, None).page(data.clone()).unwrap();
            assert_eq!(first.total, 125);
            assert_eq!(first.items.len(), 60);
            assert_eq!(first.items[59].id, "id-059");
            data.retain(|e| e.id != "id-059");
            let mut inserted = data[0].clone();
            inserted.id = "id-000-new".into();
            data.push(inserted);
            let second = request(sort, first.next_cursor).page(data.clone()).unwrap();
            assert_eq!(second.items[0].id, "id-060");
            assert_eq!(second.items.len(), 60);
            let third = request(sort, second.next_cursor).page(data).unwrap();
            assert_eq!(
                third
                    .items
                    .iter()
                    .map(|e| e.id.as_str())
                    .collect::<Vec<_>>(),
                ["id-120", "id-121", "id-122", "id-123", "id-124"]
            );
            assert!(third.next_cursor.is_none());
        }
    }

    #[test]
    fn sort_direction_and_empty_or_exact_page() {
        let mut data = entries(3);
        data[0].name = "z".into();
        data[1].name = "a".into();
        data[2].name = "b".into();
        data[0].size = 3;
        data[1].size = 1;
        data[2].size = 2;
        data[0].created_at = 1;
        data[1].created_at = 3;
        data[2].created_at = 2;
        for (sort, expected) in [
            ("name", ["id-001", "id-002", "id-000"]),
            ("size", ["id-000", "id-002", "id-001"]),
            ("newest", ["id-001", "id-002", "id-000"]),
        ] {
            let page = request(sort, None).page(data.clone()).unwrap();
            assert_eq!(
                page.items.iter().map(|e| e.id.as_str()).collect::<Vec<_>>(),
                expected
            );
        }
        for n in [0, 60] {
            let page = request("newest", None).page(entries(n)).unwrap();
            assert_eq!(page.items.len(), n);
            assert!(page.next_cursor.is_none());
        }
    }

    #[test]
    fn search_matches_fields_trigger_normalization_and_filters() {
        let entry = LibraryEntry {
            name: "Portrait".into(),
            tags: vec!["风景".into()],
            trigger_words: vec![" official ".into(), " CUSTOM ".into()],
            version: Some(ModelVersion {
                trained_words: vec![" Official ".into(), "".into()],
                ..Default::default()
            }),
            base_model: "SDXL".into(),
            missing: true,
            notes: "not searchable".into(),
            ..Default::default()
        };
        for query in [
            " PORTRAIT ",
            "风景",
            "official custom",
            "风景 official",
            "\u{feff}CUSTOM\u{feff}",
        ] {
            let req = Request::new(
                query.into(),
                "SDXL".into(),
                "missing".into(),
                "name".into(),
                None,
            )
            .unwrap();
            assert!(req.matches(&entry), "{query}");
        }
        for (query, base, status) in [
            ("not searchable", "", ""),
            ("official official", "", ""),
            ("", "SD1.5", ""),
            ("", "", "installed"),
        ] {
            assert!(!Request::new(
                query.into(),
                base.into(),
                status.into(),
                "name".into(),
                None
            )
            .unwrap()
            .matches(&entry));
        }
    }

    #[test]
    fn rejects_malformed_version_size_key_and_changed_conditions() {
        let cursor = request("name", None)
            .page(entries(61))
            .unwrap()
            .next_cursor
            .unwrap();
        for (query, base, status, sort) in [
            ("changed", "", "", "name"),
            ("", "SDXL", "", "name"),
            ("", "", "missing", "name"),
            ("", "", "", "size"),
        ] {
            assert!(Request::new(
                query.into(),
                base.into(),
                status.into(),
                sort.into(),
                Some(cursor.clone())
            )
            .is_err());
        }
        for invalid in [
            "".to_string(),
            "not json".into(),
            "x".repeat(MAX_CURSOR_BYTES + 1),
            cursor.replace("\"version\":1", "\"version\":2"),
            cursor.replace("\"Name\"", "\"Number\""),
        ] {
            assert!(Request::new(
                "".into(),
                "".into(),
                "".into(),
                "name".into(),
                Some(invalid)
            )
            .is_err());
        }
        assert!(Request::new("".into(), "".into(), "bad".into(), "name".into(), None).is_err());
        assert!(Request::new("".into(), "".into(), "".into(), "bad".into(), None).is_err());
    }

    #[test]
    fn live_missing_status_persists_without_touching_personal_fields() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("test.safetensors");
        std::fs::write(&path, b"test fixture").unwrap();
        let db = Database::open(Path::new(":memory:")).unwrap();
        let entry = LibraryEntry {
            id: "test".into(),
            path: path.to_string_lossy().into_owned(),
            missing: true,
            notes: "personal".into(),
            favorite: true,
            ..Default::default()
        };
        db.put("library", &entry.id, &entry).unwrap();
        let page = list(
            &db,
            "".into(),
            "".into(),
            "installed".into(),
            "newest".into(),
            None,
        )
        .unwrap();
        assert_eq!(page.total, 1);
        assert!(!page.items[0].missing);
        std::fs::remove_file(path).unwrap();
        assert_eq!(
            list(
                &db,
                "".into(),
                "".into(),
                "installed".into(),
                "newest".into(),
                None
            )
            .unwrap()
            .total,
            0
        );
        let saved: LibraryEntry = db.get("library", "test").unwrap();
        assert!(saved.missing && saved.favorite);
        assert_eq!(saved.notes, "personal");
    }
}
