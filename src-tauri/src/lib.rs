pub mod commands;
pub mod db;
pub mod downloads;
pub mod site;
pub mod storage;
pub mod types;
pub mod workspace;

use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{atomic::AtomicBool, Arc, Mutex},
};
use tauri::Manager;
use tokio::sync::Semaphore;
use tokio_util::sync::CancellationToken;

pub struct AppState {
    pub db: db::Database,
    pub data_dir: PathBuf,
    pub semaphore: Arc<Semaphore>,
    pub workers: Mutex<HashMap<String, CancellationToken>>,
    pub scanning: AtomicBool,
}
impl AppState {
    pub fn open(data_dir: PathBuf) -> Result<Arc<Self>, String> {
        std::fs::create_dir_all(data_dir.join("covers")).map_err(|e| e.to_string())?;
        let db = db::Database::open(&data_dir.join("library.sqlite"))?;
        db.recover()?;
        Ok(Arc::new(Self {
            db,
            data_dir,
            semaphore: Arc::new(Semaphore::new(2)),
            workers: Mutex::new(HashMap::new()),
            scanning: AtomicBool::new(false),
        }))
    }
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            #[cfg(debug_assertions)]
            let data_dir = std::env::var_os("LORA_STUDIO_TEST_DATA")
                .map(PathBuf::from)
                .unwrap_or(data_dir);
            let state = AppState::open(data_dir).map_err(std::io::Error::other)?;
            app.asset_protocol_scope()
                .allow_directory(state.data_dir.join("covers"), true)?;
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_theme(Some(tauri::Theme::Dark));
                if let Ok(Some(monitor)) = window.current_monitor() {
                    let logical = monitor.size().to_logical::<f64>(monitor.scale_factor());
                    let width = (logical.width - 48.0).clamp(960.0, 1600.0);
                    let height = (logical.height - 90.0).clamp(480.0, 1000.0);
                    let _ = window.set_min_size(Some(tauri::LogicalSize::new(
                        width.min(1000.0),
                        height.min(680.0),
                    )));
                    let _ = window.set_size(tauri::LogicalSize::new(width, height));
                    let _ = window.center();
                }
            }
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::save_settings,
            commands::save_token,
            commands::has_token,
            commands::search_models,
            commands::resolve_link,
            commands::model_details,
            commands::list_library,
            commands::update_entry,
            commands::remove_entry,
            commands::refresh_entry,
            commands::bind_entry,
            commands::set_cover,
            commands::cache_cover,
            commands::list_recipes,
            commands::save_recipe,
            commands::delete_recipe,
            commands::list_downloads,
            commands::enqueue_download,
            commands::control_download,
            commands::scan_library,
            commands::data_location,
        ])
        .build(tauri::generate_context!())
        .expect("无法初始化 LoRA Studio")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                let state = app.state::<Arc<AppState>>();
                if let Ok(workers) = state.workers.lock() {
                    for token in workers.values() {
                        token.cancel();
                    }
                };
            }
        });
}
