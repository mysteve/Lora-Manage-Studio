# 关于窗口图片 ProfileCard 验收

日期：2026-09-10。环境：Vite 开发服务器，浏览器 `?preview` 示例数据。

- `npm run build` 通过；`npm test` 通过，共 11 个测试文件、36 项测试。
- 1440 × 1000 下图片保持 192px 正方形；鼠标移动产生 3D 倾斜和浅绿色反光。
- 1000 × 720 下图片保持 144px 正方形，无横向溢出。
- 移出图片后移除 active 状态，平滑回正并隐藏反光。
- 窗口打开期间启用减少动态效果：transform 为 none，光效不显示；关闭此偏好后再次移入恢复效果。
- Escape 关闭后焦点回到关于入口；再次打开及 Tab 焦点检查通过。
- 浏览器无页面错误，控制台只有 Vite 和 React 开发提示。
- 未执行真实 Tauri 桌面及安装包验证，未验证与本次图片效果无关的下载、更新或文件操作。

截图：

- [静态 1440px](about-profile-card-idle-1440.png)
- [悬停 1440px](about-profile-card-hover-1440.png)
- [减少动态效果 1000px](about-profile-card-reduced-1000.png)
