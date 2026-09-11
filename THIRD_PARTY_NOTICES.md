# 第三方许可说明

LoRA Studio 自有代码采用根目录 [LICENSE](LICENSE) 中的 MIT 许可证。第三方代码保留原有版权与许可条件，不因项目采用 MIT 而改变。

下表列出应用关于弹窗中展示的组件声明，属于部分组件的许可记录，不是全部直接或间接依赖的完整清单。其他依赖的授权以相应软件包携带的许可证及版权声明为准。

| 组件 | 许可证 | 原文与来源 |
| --- | --- | --- |
| React | MIT | [原文](src/features/about/licenses/React.txt)，复制自当前安装版本的 `node_modules/react/LICENSE` |
| Lucide | ISC，含 Feather 部分的原版权说明 | [原文](src/features/about/licenses/Lucide.txt)，复制自当前安装版本的 `node_modules/lucide-react/LICENSE` |
| Motion | MIT | [原文](src/features/about/licenses/Motion.txt)，复制自当前安装版本的 `node_modules/motion/LICENSE.md` |
| React Bits / CountUp、ProfileCard | MIT + Commons Clause | [原文](src/components/react-bits/LICENSE.md)；[源码来源和本地修改](src/components/react-bits/README.md) |

React Bits 许可证包含针对组件本身销售、再许可及再分发的限制。应阅读对应原文，不应仅依据名称中的 MIT 判断其使用条件。

项目代码许可证不授予模型文件、下载内容或用户导入资源的权利，这些内容的使用须遵循其各自的许可。

## 提示词词库数据

扩展词库来自 [Tag Autocomplete](https://github.com/DominikDoom/a1111-sd-webui-tagcomplete) 的 Danbooru、e621、画质词条，以及 [Prompt All in One Assets](https://github.com/Physton/sd-webui-prompt-all-in-one-assets) 的中文翻译文件。两份来源仓库的 MIT 许可原文分别保存在 `src/features/prompts/data/tagcomplete-LICENSE.txt` 和 `src/features/prompts/data/prompt-all-in-one-LICENSE.txt`，随安装包一起分发。来源地址、获取日期与原始文件 SHA-256 见 `src/features/prompts/data/sources.json`。

本项目对词条进行了空格格式统一、重复词条合并和双语字段整合，保留来源标识及别名。标签中的作品、角色或画师名称不代表本项目拥有相应作品的授权。
