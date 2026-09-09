use crate::{services::site, types::*, AppState};
use std::{collections::HashMap, sync::Arc};
use tauri::{Emitter, State};

// 旧版本曾删除受限图片；仅补回预览资料，不重新读取模型文件或覆盖个人编辑。
fn merge_images(entry: &mut LibraryEntry, fresh: &ModelVersion) {
    let Some(version) = entry.version.as_mut().filter(|v| v.id == fresh.id) else {
        return;
    };
    merge_version_images(version, fresh);
    let images = &version.images;
    if entry.custom_cover {
        if let Some(source) = images.iter().find(|image| image.url == entry.cover.url) {
            entry.cover.nsfw_level = source.nsfw_level;
        }
    } else {
        entry.cover = images.first().cloned().unwrap_or_default();
    }
}

fn merge_version_images(version: &mut ModelVersion, fresh: &ModelVersion) {
    if version.id != fresh.id {
        return;
    }
    let mut images = fresh.images.clone();
    for image in &mut images {
        if let Some(old) = version.images.iter().find(|old| old.url == image.url) {
            image.local_path = old.local_path.clone();
        }
    }
    version.images = images;
    version.images_classified = true;
}

#[tauri::command]
pub async fn refresh_library_cover_metadata(
    state: State<'_, Arc<AppState>>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    // 多次挂载或连续保存设置时复用同一队列。
    let _guard = state.cover_metadata_lock.lock().await;
    let mut pending: Vec<_> = state
        .db
        .list::<LibraryEntry>("library")?
        .into_iter()
        .filter_map(|entry| {
            entry
                .version
                .filter(|v| !v.images_classified)
                .map(|version| (false, entry.id, version))
        })
        .collect();
    pending.extend(
        state
            .db
            .list::<DownloadTask>("downloads")?
            .into_iter()
            .filter(|task| !task.version.images_classified)
            .map(|task| (true, task.id, task.version)),
    );
    let mut fetched = HashMap::<u64, ModelVersion>::new();
    let mut failures = 0;
    let mut consecutive_failures = 0;
    for (download, id, version) in pending {
        let result = if let Some(fresh) = fetched.get(&version.id) {
            Ok(fresh.clone())
        } else {
            let result = site::get_version(&state.db.settings(), version.id).await;
            tokio::time::sleep(std::time::Duration::from_millis(300)).await;
            result
        };
        match result {
            Ok(fresh) if fresh.id == version.id && fresh.model_id == version.model_id => {
                consecutive_failures = 0;
                fetched.insert(fresh.id, fresh.clone());
                if download {
                    if state
                        .db
                        .update_download(&id, |latest| {
                            merge_version_images(&mut latest.version, &fresh);
                            Ok(())
                        })
                        .is_ok()
                    {
                        let _ = app.emit("download-covers-changed", ());
                    }
                } else if state
                    .db
                    .update_library(&id, |latest| {
                        merge_images(latest, &fresh);
                        Ok(())
                    })
                    .is_ok()
                {
                    let _ = app.emit("library-changed", ());
                }
            }
            Err(error) if error.contains("不存在") => {
                failures += 1;
                consecutive_failures = 0;
            }
            _ => {
                failures += 1;
                consecutive_failures += 1;
            }
        }
        if consecutive_failures >= 3 {
            break;
        }
    }
    if failures > 0 {
        return Err(
            "部分旧封面的分级暂未更新，请检查网站访问设置后重新保存，或在模型详情中更新资料".into(),
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn restores_filtered_images_and_preserves_personal_data() {
        let mut entry = LibraryEntry {
            name: "个人名称".into(),
            notes: "备注".into(),
            favorite: true,
            version: Some(ModelVersion {
                id: 7,
                ..Default::default()
            }),
            ..Default::default()
        };
        let fresh = ModelVersion {
            id: 7,
            images: vec![Cover {
                url: "https://image.civitai.red/restricted.png".into(),
                nsfw_level: Some(4),
                meta: Some(serde_json::json!({"seed": 0})),
                ..Default::default()
            }],
            ..Default::default()
        };
        merge_images(&mut entry, &fresh);
        assert_eq!(entry.cover.nsfw_level, Some(4));
        assert_eq!(entry.cover.meta.as_ref().unwrap()["seed"], 0);
        assert!(entry.version.as_ref().unwrap().images_classified);
        assert_eq!(entry.name, "个人名称");
        assert_eq!(entry.notes, "备注");
        assert!(entry.favorite);
    }

    #[test]
    fn preserves_custom_covers_and_ignores_rebound_versions() {
        let mut entry = LibraryEntry {
            custom_cover: true,
            cover: Cover {
                local_path: "custom.png".into(),
                ..Default::default()
            },
            version: Some(ModelVersion {
                id: 7,
                ..Default::default()
            }),
            ..Default::default()
        };
        merge_images(
            &mut entry,
            &ModelVersion {
                id: 8,
                ..Default::default()
            },
        );
        assert!(!entry.version.as_ref().unwrap().images_classified);
        merge_images(
            &mut entry,
            &ModelVersion {
                id: 7,
                ..Default::default()
            },
        );
        assert_eq!(entry.cover.local_path, "custom.png");
        assert!(entry.version.as_ref().unwrap().images_classified);
    }

    #[test]
    fn classifies_custom_remote_cover_without_losing_cached_path() {
        let cover = Cover {
            url: "remote.png".into(),
            local_path: "cached.png".into(),
            ..Default::default()
        };
        let mut entry = LibraryEntry {
            custom_cover: true,
            cover: cover.clone(),
            version: Some(ModelVersion {
                id: 7,
                images: vec![cover.clone()],
                ..Default::default()
            }),
            ..Default::default()
        };
        let fresh = ModelVersion {
            id: 7,
            images: vec![Cover {
                nsfw_level: Some(4),
                local_path: String::new(),
                ..cover
            }],
            ..Default::default()
        };
        merge_images(&mut entry, &fresh);
        assert_eq!(entry.cover.local_path, "cached.png");
        assert_eq!(entry.cover.nsfw_level, Some(4));
        assert_eq!(entry.version.unwrap().images[0].local_path, "cached.png");
    }
}
