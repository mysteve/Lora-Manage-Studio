# 开发资源监测验收

日期：2026-09-09。

左上角品牌下新增 DEV 资源监测按钮，开发前端按需加载，并检查桌面构建标记。正式前端包不包含监测组件；Rust 发布构建不编译 Windows 采样实现，相关命令返回不可用。

面板统计当前主进程及其子进程，通过 Windows ToolHelp、GetProcessTimes、K32GetProcessMemoryInfo 采样。句柄由 RAII 释放，不启动 PowerShell 等辅助采样进程。每次请求完成后等待 2 秒再发起下一次；关闭、暂停和页面隐藏会取消后续定时器及丢弃旧响应。

CPU 按进程 ID 和创建时间匹配，累计 CPU 时间差除以实际间隔和可用逻辑处理器数。内存提供工作集与私有提交值，注明共享内存可能重复计入；进程明细包含 PID、CPU、工作集。未声称提供 GPU 或独立磁盘/网络监控。

实际验证：

- npm run build 通过，生产 JavaScript 中未发现资源监测组件、文案或采样命令。
- npm test：21 项通过，新增 4 项覆盖首帧、CPU 计算、PID 复用、退出进程。
- cargo test services::resources：2 项通过，其中实际读取 Windows 当前测试进程的内存和线程，另一项验证子进程树。
- cargo clippy --all-targets -- -D warnings、cargo check --release、cargo fmt -- --check 通过。
- 1000×680 浏览器预览：入口、说明、关闭、跨页面悬浮，无横向溢出。
- 独立浏览器测试页面使用明确标注的模拟进程数据，确认第二次采样显示预期 CPU/内存，暂停期间请求数不变，继续恢复请求，关闭后请求数不再增长。此测试页面位于忽略目录 .test-data，不加入产品。
- 截图 resource-monitor-preview.png 为真实预览状态；resource-monitor-fixture.png 为明确标注的模拟测试数据，不能当作真实应用占用。

未验证：完整 Tauri 桌面中 WebView2 进程树的长期监测、最小化可见性通知及与任务管理器数值对照。实际进程采样已由 Windows 原生测试验证。

统计口径参考：https://learn.microsoft.com/en-us/windows/win32/api/psapi/ns-psapi-process_memory_counters_ex。


后续更新：按用户要求移除面板底部两段统计口径说明，说明仍保留在 README 中。模拟测试截图记录的是移除前的界面。

提交前验证：前端构建及 21 项测试通过；Rust 全量 45 项通过、1 项既有外网测试跳过；格式和差异检查通过。
