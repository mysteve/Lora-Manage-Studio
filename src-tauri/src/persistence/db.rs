use crate::types::*;
use rusqlite::{params, Connection};
use serde::{de::DeserializeOwned, Serialize};
use std::{path::Path, sync::Mutex};

pub struct Database(pub Mutex<Connection>);
impl Database {
    pub fn open(path: &Path) -> Result<Self, String> {
        let conn = Connection::open(path).map_err(|e| e.to_string())?;
        conn.execute_batch(
            "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
            CREATE TABLE IF NOT EXISTS settings (id TEXT PRIMARY KEY, data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS library (id TEXT PRIMARY KEY, data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS recipes (id TEXT PRIMARY KEY, data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS downloads (id TEXT PRIMARY KEY, data TEXT NOT NULL);
            PRAGMA user_version=1;",
        )
        .map_err(|e| e.to_string())?;
        Ok(Self(Mutex::new(conn)))
    }
    pub fn put<T: Serialize>(&self, table: &str, id: &str, value: &T) -> Result<(), String> {
        Self::table(table)?;
        let json = serde_json::to_string(value).map_err(|e| e.to_string())?;
        self.0.lock().map_err(|e|e.to_string())?.execute(&format!("INSERT INTO {table}(id,data) VALUES(?1,?2) ON CONFLICT(id) DO UPDATE SET data=excluded.data"), params![id,json]).map_err(|e|e.to_string())?;
        Ok(())
    }
    pub fn list<T: DeserializeOwned>(&self, table: &str) -> Result<Vec<T>, String> {
        Self::table(table)?;
        let conn = self.0.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(&format!("SELECT data FROM {table} ORDER BY rowid DESC"))
            .map_err(|e| e.to_string())?;
        let strings = stmt
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        strings
            .into_iter()
            .map(|s| serde_json::from_str(&s).map_err(|e| e.to_string()))
            .collect()
    }
    pub fn get<T: DeserializeOwned>(&self, table: &str, id: &str) -> Result<T, String> {
        Self::table(table)?;
        let json: String = self
            .0
            .lock()
            .map_err(|e| e.to_string())?
            .query_row(
                &format!("SELECT data FROM {table} WHERE id=?1"),
                [id],
                |r| r.get(0),
            )
            .map_err(|_| "记录不存在".to_string())?;
        serde_json::from_str(&json).map_err(|e| e.to_string())
    }
    pub fn remove(&self, table: &str, id: &str) -> Result<(), String> {
        Self::table(table)?;
        self.0
            .lock()
            .map_err(|e| e.to_string())?
            .execute(&format!("DELETE FROM {table} WHERE id=?1"), [id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    pub fn update_library(
        &self,
        id: &str,
        update: impl FnOnce(&mut LibraryEntry) -> Result<(), String>,
    ) -> Result<LibraryEntry, String> {
        self.update("library", id, update)
    }
    pub fn update_download(
        &self,
        id: &str,
        update: impl FnOnce(&mut DownloadTask) -> Result<(), String>,
    ) -> Result<DownloadTask, String> {
        self.update("downloads", id, update)
    }
    fn update<T: DeserializeOwned + Serialize>(
        &self,
        table: &str,
        id: &str,
        update: impl FnOnce(&mut T) -> Result<(), String>,
    ) -> Result<T, String> {
        Self::table(table)?;
        let conn = self.0.lock().map_err(|e| e.to_string())?;
        let json: String = conn
            .query_row(
                &format!("SELECT data FROM {table} WHERE id=?1"),
                [id],
                |row| row.get(0),
            )
            .map_err(|_| "记录不存在".to_string())?;
        let mut entry: T = serde_json::from_str(&json).map_err(|e| e.to_string())?;
        update(&mut entry)?;
        let json = serde_json::to_string(&entry).map_err(|e| e.to_string())?;
        conn.execute(
            &format!("UPDATE {table} SET data=?1 WHERE id=?2"),
            params![json, id],
        )
        .map_err(|e| e.to_string())?;
        Ok(entry)
    }
    fn table(table: &str) -> Result<(), String> {
        if ["library", "recipes", "downloads", "settings"].contains(&table) {
            Ok(())
        } else {
            Err("无效的数据表".into())
        }
    }
    pub fn settings(&self) -> Settings {
        self.get("settings", "main").unwrap_or_default()
    }
    pub fn dismiss_setup(&self) -> Result<Settings, String> {
        let mut settings = self.settings();
        settings.setup_dismissed = true;
        self.put("settings", "main", &settings)?;
        Ok(settings)
    }
    pub fn recover(&self) -> Result<(), String> {
        for mut task in self.list::<DownloadTask>("downloads")? {
            if ["queued", "downloading", "verifying"].contains(&task.status.as_str()) {
                task.status = "paused".into();
                task.speed = 0.0;
                task.error = "应用重新启动，点击继续恢复下载".into();
                self.put("downloads", &task.id, &task)?;
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn dismissing_setup_persists_without_changing_existing_settings() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("db.sqlite");
        let original = serde_json::json!({
            "loraDir": "D:\\existing-models", "comfyRoot": "",
            "proxyMode": "manual", "proxyUrl": "http://127.0.0.1:7890", "safeContent": false
        });
        {
            let db = Database::open(&path).unwrap();
            db.put("settings", "main", &original).unwrap();
            assert!(!db.settings().setup_dismissed);
            assert!(db.dismiss_setup().unwrap().setup_dismissed);
        }
        let db = Database::open(&path).unwrap();
        let mut expected = original;
        expected["setupDismissed"] = true.into();
        assert_eq!(serde_json::to_value(db.settings()).unwrap(), expected);
    }
    #[test]
    fn interrupted_tasks_recover_as_paused() {
        let d = tempfile::tempdir().unwrap();
        let db = Database::open(&d.path().join("db.sqlite")).unwrap();
        for status in [
            "queued",
            "downloading",
            "verifying",
            "completed",
            "cancelled",
        ] {
            let task = DownloadTask {
                id: status.into(),
                model: RemoteModel::default(),
                version: ModelVersion::default(),
                file: SourceFile::default(),
                destination: "C:\\models\\test.safetensors".into(),
                status: status.into(),
                downloaded: 123,
                total: 456,
                speed: 42.0,
                error: String::new(),
                created_at: 1,
            };
            db.put("downloads", status, &task).unwrap();
        }
        db.recover().unwrap();
        for status in ["queued", "downloading", "verifying"] {
            let t: DownloadTask = db.get("downloads", status).unwrap();
            assert_eq!(t.status, "paused");
            assert_eq!(t.downloaded, 123);
            assert_eq!(t.speed, 0.0);
        }
        assert_eq!(
            db.get::<DownloadTask>("downloads", "completed")
                .unwrap()
                .status,
            "completed"
        );
        assert_eq!(
            db.get::<DownloadTask>("downloads", "cancelled")
                .unwrap()
                .status,
            "cancelled"
        );
    }
    #[test]
    fn persistence_and_personal_data() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("db.sqlite");
        {
            let db = Database::open(&path).unwrap();
            let entry = LibraryEntry {
                id: "one".into(),
                name: "我的别名".into(),
                trigger_words: vec!["myStyle".into()],
                notes: "我的备注".into(),
                favorite: true,
                ..Default::default()
            };
            db.put("library", "one", &entry).unwrap();
            let recipe = Recipe {
                id: "recipe".into(),
                owner: "local:one".into(),
                name: "我的提示词".into(),
                positive: "soft light".into(),
                negative: "blur".into(),
                model_weight: 0.8,
                clip_weight: 1.0,
                notes: String::new(),
            };
            db.put("recipes", "recipe", &recipe).unwrap();
        }
        let db = Database::open(&path).unwrap();
        let entry: LibraryEntry = db.get("library", "one").unwrap();
        assert_eq!(entry.notes, "我的备注");
        assert_eq!(entry.name, "我的别名");
        assert_eq!(entry.trigger_words, vec!["myStyle"]);
        let recipe: Recipe = db.get("recipes", "recipe").unwrap();
        assert_eq!(recipe.owner, "local:one");
        assert_eq!(recipe.positive, "soft light");
        assert_eq!(recipe.negative, "blur");
        assert!(entry.favorite);
    }
    #[test]
    fn older_library_records_default_to_no_custom_triggers() {
        let mut old = serde_json::to_value(LibraryEntry::default()).unwrap();
        old.as_object_mut().unwrap().remove("triggerWords");
        old.as_object_mut().unwrap().remove("triggerPreviews");
        let entry: LibraryEntry = serde_json::from_value(old).unwrap();
        assert!(entry.trigger_words.is_empty());
        assert!(entry.trigger_previews.is_empty());
    }
}
