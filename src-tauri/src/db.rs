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
                notes: "我的备注".into(),
                favorite: true,
                ..Default::default()
            };
            db.put("library", "one", &entry).unwrap();
        }
        let db = Database::open(&path).unwrap();
        let entry: LibraryEntry = db.get("library", "one").unwrap();
        assert_eq!(entry.notes, "我的备注");
        assert!(entry.favorite);
    }
}
