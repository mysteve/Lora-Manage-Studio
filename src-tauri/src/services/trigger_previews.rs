use crate::{services::storage, types::*, AppState};

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewInput {
    pub id: String,
    pub name: String,
    pub trigger_words: Vec<String>,
    pub notes: String,
    pub image_path: Option<String>,
    pub remove_image: bool,
}

pub async fn save(
    state: &AppState,
    entry_id: &str,
    input: PreviewInput,
) -> Result<LibraryEntry, String> {
    let words = storage::normalize_trigger_words(input.trigger_words);
    if words.is_empty() {
        return Err("请至少填写一个触发词".into());
    }
    let initial: LibraryEntry = state.db.get("library", entry_id)?;
    if !input.id.is_empty() && !initial.trigger_previews.iter().any(|p| p.id == input.id) {
        return Err("该组合已不存在，请重新打开模型详情".into());
    }
    let image = if let Some(path) = input.image_path.filter(|p| !p.trim().is_empty()) {
        Some(storage::import_image(state, path.trim()).await?)
    } else if input.remove_image {
        Some(Cover::default())
    } else {
        None
    };
    state.db.update_library(entry_id, move |entry| {
        let index = if input.id.is_empty() {
            entry.trigger_previews.len()
        } else {
            entry
                .trigger_previews
                .iter()
                .position(|p| p.id == input.id)
                .ok_or("该组合已不存在，请重新打开模型详情")?
        };
        let preview = TriggerPreview {
            id: if input.id.is_empty() {
                uuid::Uuid::new_v4().to_string()
            } else {
                input.id
            },
            name: if input.name.trim().is_empty() {
                words.join(" + ")
            } else {
                input.name.trim().into()
            },
            trigger_words: words,
            image: image.unwrap_or_else(|| {
                entry
                    .trigger_previews
                    .get(index)
                    .map(|p| p.image.clone())
                    .unwrap_or_default()
            }),
            notes: input.notes,
        };
        if index == entry.trigger_previews.len() {
            entry.trigger_previews.push(preview);
        } else {
            entry.trigger_previews[index] = preview;
        }
        Ok(())
    })
}

pub fn remove(state: &AppState, entry_id: &str, preview_id: &str) -> Result<LibraryEntry, String> {
    state.db.update_library(entry_id, |entry| {
        if !entry.trigger_previews.iter().any(|p| p.id == preview_id) {
            return Err("该组合已不存在".into());
        }
        entry.trigger_previews.retain(|p| p.id != preview_id);
        Ok(())
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn input(id: &str, words: &[&str], path: Option<&std::path::Path>) -> PreviewInput {
        PreviewInput {
            id: id.into(),
            name: String::new(),
            trigger_words: words.iter().map(|s| s.to_string()).collect(),
            notes: "权重 0.8".into(),
            image_path: path.map(|p| p.to_string_lossy().into()),
            remove_image: false,
        }
    }
    fn add_entry(state: &AppState, id: &str) {
        state
            .db
            .put(
                "library",
                id,
                &LibraryEntry {
                    id: id.into(),
                    name: "原模型".into(),
                    notes: "个人资料".into(),
                    ..Default::default()
                },
            )
            .unwrap();
    }
    #[tokio::test]
    async fn combinations_keep_separate_images_after_restart_and_source_removal() {
        let temp = tempfile::tempdir().unwrap();
        let data = temp.path().join("data");
        let first = temp.path().join("单词.png");
        let second = temp.path().join("组合.png");
        image::RgbImage::from_pixel(4, 3, image::Rgb([255, 0, 0]))
            .save(&first)
            .unwrap();
        image::RgbImage::from_pixel(3, 4, image::Rgb([0, 255, 0]))
            .save(&second)
            .unwrap();
        let state = AppState::open(data.clone()).unwrap();
        add_entry(&state, "model");
        save(&state, "model", input("", &[" A ", "a", ""], Some(&first)))
            .await
            .unwrap();
        let saved = save(&state, "model", input("", &["A", "B"], Some(&second)))
            .await
            .unwrap();
        assert_eq!(saved.trigger_previews.len(), 2);
        assert_eq!(saved.trigger_previews[0].trigger_words, vec!["A"]);
        assert_eq!(saved.trigger_previews[1].trigger_words, vec!["A", "B"]);
        assert_eq!(saved.trigger_previews[1].name, "A + B");
        assert_ne!(
            saved.trigger_previews[0].image.local_path,
            saved.trigger_previews[1].image.local_path
        );
        assert_eq!(saved.name, "原模型");
        assert_eq!(saved.notes, "个人资料");
        std::fs::remove_file(first).unwrap();
        std::fs::remove_file(second).unwrap();
        drop(state);
        let reopened = AppState::open(data).unwrap();
        let loaded: LibraryEntry = reopened.db.get("library", "model").unwrap();
        let a = &loaded.trigger_previews[0];
        let ab = &loaded.trigger_previews[1];
        assert_eq!(
            image::open(&a.image.local_path)
                .unwrap()
                .to_rgb8()
                .get_pixel(0, 0)
                .0,
            [255, 0, 0]
        );
        assert_eq!(
            image::open(&ab.image.local_path)
                .unwrap()
                .to_rgb8()
                .get_pixel(0, 0)
                .0,
            [0, 255, 0]
        );
        let edited = save(&reopened, "model", input(&a.id, &["A", "C"], None))
            .await
            .unwrap();
        assert_eq!(
            edited.trigger_previews[0].image.local_path,
            a.image.local_path
        );
        assert_eq!(edited.trigger_previews[1].trigger_words, ab.trigger_words);
        let merged = storage::merge_personal(&edited, LibraryEntry::default());
        assert_eq!(merged.trigger_previews.len(), 2);
        assert_eq!(
            merged.trigger_previews[0].image.local_path,
            a.image.local_path
        );
        let remaining = remove(&reopened, "model", &a.id).unwrap();
        assert_eq!(remaining.trigger_previews.len(), 1);
        assert_eq!(remaining.trigger_previews[0].id, ab.id);
        assert!(std::path::Path::new(&ab.image.local_path).is_file());
    }
    #[tokio::test]
    async fn invalid_edits_preserve_existing_combinations() {
        let temp = tempfile::tempdir().unwrap();
        let state = AppState::open(temp.path().join("data")).unwrap();
        add_entry(&state, "a");
        add_entry(&state, "b");
        let saved = save(&state, "a", input("", &["A"], None)).await.unwrap();
        let id = &saved.trigger_previews[0].id;
        assert!(save(&state, "a", input(id, &[" "], None)).await.is_err());
        assert!(save(&state, "b", input(id, &["B"], None)).await.is_err());
        assert!(remove(&state, "b", id).is_err());
        let broken = temp.path().join("invalid.png");
        std::fs::write(&broken, b"not an image").unwrap();
        assert!(save(&state, "a", input(id, &["B"], Some(&broken)))
            .await
            .is_err());
        let loaded: LibraryEntry = state.db.get("library", "a").unwrap();
        assert_eq!(loaded.trigger_previews[0].trigger_words, vec!["A"]);
        let other: LibraryEntry = state.db.get("library", "b").unwrap();
        assert!(other.trigger_previews.is_empty());
    }
    #[tokio::test]
    async fn image_can_be_replaced_or_removed_without_losing_words() {
        let temp = tempfile::tempdir().unwrap();
        let state = AppState::open(temp.path().join("data")).unwrap();
        add_entry(&state, "a");
        let source = temp.path().join("preview.png");
        image::RgbImage::new(3, 3).save(&source).unwrap();
        let first = save(&state, "a", input("", &["A", "B"], Some(&source)))
            .await
            .unwrap();
        let id = &first.trigger_previews[0].id;
        let replaced = save(&state, "a", input(id, &["A", "B"], Some(&source)))
            .await
            .unwrap();
        assert_ne!(
            first.trigger_previews[0].image.local_path,
            replaced.trigger_previews[0].image.local_path
        );
        let mut edit = input(id, &["A", "B"], None);
        edit.remove_image = true;
        let removed = save(&state, "a", edit).await.unwrap();
        assert!(removed.trigger_previews[0].image.local_path.is_empty());
        assert_eq!(removed.trigger_previews[0].trigger_words, vec!["A", "B"]);
    }
}
