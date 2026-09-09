use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceProcess {
    pid: u32,
    name: String,
    started: String,
    cpu_ms: f64,
    working_set: u64,
    private_bytes: u64,
    threads: u32,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceSnapshot {
    elapsed_ms: f64,
    logical_cpus: usize,
    root_pid: u32,
    skipped: usize,
    processes: Vec<ResourceProcess>,
}
#[tauri::command]
pub fn debug_resources_enabled() -> bool {
    cfg!(all(debug_assertions, windows))
}

#[tauri::command]
pub async fn debug_resource_snapshot() -> Result<ResourceSnapshot, String> {
    #[cfg(all(debug_assertions, windows))]
    {
        tauri::async_runtime::spawn_blocking(windows::sample)
            .await
            .map_err(|_| "资源采样任务失败".to_string())?
    }
    #[cfg(not(all(debug_assertions, windows)))]
    {
        Err("资源监测仅支持 Windows 开发构建".into())
    }
}

#[cfg(all(debug_assertions, windows))]
mod windows {
    use super::*;
    use std::{collections::HashSet, mem::size_of, sync::OnceLock, time::Instant};
    use windows_sys::Win32::{
        Foundation::{CloseHandle, FILETIME, HANDLE, INVALID_HANDLE_VALUE},
        System::{
            Diagnostics::ToolHelp::{
                CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
                TH32CS_SNAPPROCESS,
            },
            ProcessStatus::{K32GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS_EX},
            Threading::{GetProcessTimes, OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_VM_READ},
        },
    };
    struct Handle(HANDLE);
    impl Drop for Handle {
        fn drop(&mut self) {
            unsafe {
                CloseHandle(self.0);
            }
        }
    }
    fn descendants(entries: &[PROCESSENTRY32W], root: u32) -> HashSet<u32> {
        let mut ids = HashSet::from([root]);
        loop {
            let before = ids.len();
            for entry in entries {
                if ids.contains(&entry.th32ParentProcessID) {
                    ids.insert(entry.th32ProcessID);
                }
            }
            if before == ids.len() {
                break;
            }
        }
        ids
    }
    fn ticks(time: FILETIME) -> u64 {
        ((time.dwHighDateTime as u64) << 32) | time.dwLowDateTime as u64
    }
    fn process(entry: &PROCESSENTRY32W) -> Option<ResourceProcess> {
        // 只请求查询权限，RAII 保证所有采样句柄在当前调用结束前释放。
        unsafe {
            let raw = OpenProcess(
                PROCESS_QUERY_INFORMATION | PROCESS_VM_READ,
                0,
                entry.th32ProcessID,
            );
            if raw.is_null() {
                return None;
            }
            let handle = Handle(raw);
            let mut memory: PROCESS_MEMORY_COUNTERS_EX = std::mem::zeroed();
            memory.cb = size_of::<PROCESS_MEMORY_COUNTERS_EX>() as u32;
            if K32GetProcessMemoryInfo(handle.0, &mut memory as *mut _ as *mut _, memory.cb) == 0 {
                return None;
            }
            let (mut created, mut exited, mut kernel, mut user): (
                FILETIME,
                FILETIME,
                FILETIME,
                FILETIME,
            ) = std::mem::zeroed();
            if GetProcessTimes(handle.0, &mut created, &mut exited, &mut kernel, &mut user) == 0 {
                return None;
            }
            let length = entry
                .szExeFile
                .iter()
                .position(|c| *c == 0)
                .unwrap_or(entry.szExeFile.len());
            Some(ResourceProcess {
                pid: entry.th32ProcessID,
                name: String::from_utf16_lossy(&entry.szExeFile[..length]),
                started: ticks(created).to_string(),
                cpu_ms: (ticks(kernel) + ticks(user)) as f64 / 10_000.0,
                working_set: memory.WorkingSetSize as u64,
                private_bytes: memory.PrivateUsage as u64,
                threads: entry.cntThreads,
            })
        }
    }
    pub(super) fn sample() -> Result<ResourceSnapshot, String> {
        static START: OnceLock<Instant> = OnceLock::new();
        let start = START.get_or_init(Instant::now);
        let root = std::process::id();
        let entries = unsafe {
            let raw = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
            if raw == INVALID_HANDLE_VALUE {
                return Err("无法读取进程列表".into());
            }
            let snapshot = Handle(raw);
            let mut entry: PROCESSENTRY32W = std::mem::zeroed();
            entry.dwSize = size_of::<PROCESSENTRY32W>() as u32;
            let mut entries = Vec::new();
            if Process32FirstW(snapshot.0, &mut entry) == 0 {
                return Err("无法枚举应用进程".into());
            }
            loop {
                entries.push(entry);
                if Process32NextW(snapshot.0, &mut entry) == 0 {
                    break;
                }
            }
            entries
        };
        let ids = descendants(&entries, root);
        let mut skipped = 0;
        let mut processes = Vec::new();
        for entry in entries.iter().filter(|e| ids.contains(&e.th32ProcessID)) {
            match process(entry) {
                Some(value) => processes.push(value),
                None => skipped += 1,
            }
        }
        if !processes.iter().any(|p| p.pid == root) {
            return Err("无法读取应用主进程资源".into());
        }
        processes.sort_by_key(|p| (p.pid != root, p.pid));
        Ok(ResourceSnapshot {
            elapsed_ms: start.elapsed().as_secs_f64() * 1000.0,
            logical_cpus: std::thread::available_parallelism().map_or(1, |n| n.get()),
            root_pid: root,
            skipped,
            processes,
        })
    }
    #[cfg(test)]
    mod tests {
        use super::*;
        #[test]
        fn tree_includes_nested_children_only() {
            let entry = |pid, parent| PROCESSENTRY32W {
                th32ProcessID: pid,
                th32ParentProcessID: parent,
                ..Default::default()
            };
            let ids = descendants(&[entry(3, 2), entry(2, 1), entry(1, 10), entry(9, 10)], 1);
            assert_eq!(ids, HashSet::from([1, 2, 3]));
        }
        #[test]
        fn reads_current_process_without_external_tools() {
            let data = sample().unwrap();
            let process = data
                .processes
                .iter()
                .find(|p| p.pid == std::process::id())
                .unwrap();
            assert!(process.working_set > 0);
            assert!(process.private_bytes > 0);
            assert!(process.threads > 0);
            assert!(data.logical_cpus > 0);
        }
    }
}
