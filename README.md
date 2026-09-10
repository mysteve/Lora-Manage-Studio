# LoRA Studio

<p align="center">
  <img src="docs/design/lora-studio-chibi-icon-v1.png" width="180" alt="LoRA Studio Q 版模型管理助手" />
</p>

LoRA Studio 是面向 Windows 的本地 LoRA 模型管理工具，帮助 ComfyUI 用户集中整理模型、触发词、提示词和效果图。支持在线搜索与下载模型、本地模型导入和分类管理，让模型更容易查找、使用和复用。


## 许可证

LoRA Studio 的自有代码采用 [MIT License](LICENSE)，版权声明为 `Copyright (c) 2026 LoRA Studio contributors`。

在遵守 MIT 条款并保留版权声明及许可证文本的前提下，你可以使用、复制、修改、分发和商业使用这些代码。软件按原样提供，不附带担保，完整条款以 [LICENSE](LICENSE) 为准。

第三方依赖及引入的组件继续遵循各自的许可证，项目的 MIT 声明不替代它们的授权条款。尤其是 [React Bits 组件](src/components/react-bits/README.md) 使用 [MIT + Commons Clause](src/components/react-bits/LICENSE.md)，包含针对组件本身销售、再许可及再分发的限制。使用或分发相关部分时，应同时遵守这些条款。

部分组件的许可证原文及来源见 [第三方许可说明](THIRD_PARTY_NOTICES.md)，也可以点击应用左上角的 LoRA Studio，在关于弹窗中查看项目 MIT 许可证及组件声明。模型文件、下载内容及用户导入的资源不属于本项目代码授权范围。


## 开发模式资源监测

在项目根目录运行 `npm run tauri -- dev`，点击左上角的资源监测 DEV 按钮，可打开独立悬浮面板，同时操作应用并观察资源变化。

- 每两秒统计主进程及其子进程（包括 WebView2）的 CPU、工作集内存、私有提交内存，以及进程和线程数量。
- 支持暂停和继续，关闭面板或窗口不可见时停止后续采样。
- CPU 需要两次采样，按可用逻辑处理器归一化。工作集相加可能包含重复的共享内存，私有提交内存不等同于物理内存。
- 不包含独立运行的 ComfyUI、Vite 和编译器。浏览器预览仅显示说明，正式发布版不提供资源监测入口或采样能力。

提示词组合：在词句组合页面自由添加多段提示词，命名片段、拖动或用键盘调整顺序、通过顶部按钮添加片段、启用或停用片段，分别复制正向和负向结果。切换页面保留本次编辑；可按名称保存预设，下次打开后选择并加载。预设保存正负向片段、名称、顺序和启用状态，支持同名覆盖确认及删除。模型详情中的原有配方仍可编辑。
