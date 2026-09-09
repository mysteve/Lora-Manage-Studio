# 关于项目弹窗验收

日期：2026-09-09。

左上角品牌区改为可点击按钮，保留其上方的窗口拖动区域。弹窗复用 Modal，支持 Escape、焦点循环和关闭后焦点恢复。

高清图标来自项目现有 docs/design/lora-studio-chibi-icon-v1.png，尺寸为 1254×1254，复制至 public/lora-studio-icon-hd.png。版本来源为 tauri.conf.json，与侧栏统一。

检查更新由 Rust 请求固定项目 GitHub latest release 接口，使用已保存代理、20 秒超时，不携带网站或 AI 凭据。404 表示未找到公开正式版本，不误报为最新；请求限制和网络错误可以重试或打开发布页。只提供手动下载入口，不自动安装。API 依据：https://docs.github.com/en/rest/releases/releases#get-the-latest-release。

仓库没有项目 LICENSE，因此不擅自声明授权。弹窗展示 React、Lucide、Motion 和 React Bits 的现有许可证原文示例；前三者来自当前安装依赖的 LICENSE，React Bits 使用仓库已有许可证。示例不是完整依赖清单。

实际验证：

- npm run build 通过；npm test 17 项通过。
- cargo clippy --all-targets -- -D warnings 通过；cargo test 43 项通过，1 项既有外网测试跳过。
- 新增测试覆盖版本数字比较、无效标签、仅允许项目仓库与发布页外链。
- 浏览器预览检查 1440×1000、1000×680，无横向溢出；图片实际加载尺寸 1254px。
- 检查弹窗打开、许可证展开、预览更新错误、Escape 关闭和焦点恢复，以及正常与减少动态效果模式。控制台未出现运行错误。
- 截图 about-1440.png、about-1000.png。

未验证：真实桌面更新请求、系统浏览器打开和安装包。本次未访问或修改用户凭据，也未安装更新。


后续更新：用户已选择 MIT，根目录新增 LICENSE，README、包元数据与弹窗同步声明自有代码采用 MIT。弹窗默认展示项目 MIT 原文，第三方许可证独立保留；上方截图记录的是声明 MIT 前的界面。
