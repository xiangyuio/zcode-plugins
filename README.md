# zcode-plugins

ZCode 插件集合。仓库根目录同时是一个本地 ZCode 插件市场（`marketplace.json`），把本仓库添加为市场源后，即可一键安装其中的所有插件。

仓库：https://github.com/xiangyuio/zcode-plugins

## 包含哪些插件

| 插件 | 说明 |
| --- | --- |
| [pele-mermaid](./plugins/pele-mermaid/) | 对话中展示 Mermaid 图时，用 [Pele](https://pele.run/)（Obsidian 官方 Mermaid 渲染库）渲染为主题化内联 SVG，让图直接显示在对话里，替代裸 `mermaid` 代码块；亮/暗主题自适应，片段自带"复制 Mermaid 代码"按钮和缩放控件。 |

各插件的详细介绍、效果截图和使用说明见其目录下的 README（如 [plugins/pele-mermaid/README.md](./plugins/pele-mermaid/README.md)）。

## 如何安装

### 前置要求

- ZCode 客户端（通过"插件市场"管理插件）。
- `pele-mermaid` 的渲染脚本需要本机安装 Node ≥ 18；缺失时插件会自动回退为普通 `mermaid` 代码块。

### 1. 添加本仓库为插件市场

在客户端中打开 插件市场 → 添加 → 添加插件市场，二选一粘贴：

- **GitHub**：`https://github.com/xiangyuio/zcode-plugins`
- **本地**：克隆本仓库后，粘贴仓库的本地根目录路径

添加后即可在"个人"中看到 `xiangyuio-zcode-plugins` 市场（具体以客户端支持的源格式为准）。

### 2. 安装插件

在市场中找到想要的插件（如 **Pele Mermaid 渲染**），点击安装。插件提供的是技能（skill），安装后对话中自动生效。

### 3. 更新插件

插件发布新版本后：在市场源中对本市场执行"刷新该市场"，再到插件详情页点击"更新"。

## 开发

- 新插件的开发源码放 `src/<name>/`，安装内容（`.zcode-plugin/plugin.json`、`skills/`、运行时脚本、`assets/`、`README.md`）放 `plugins/<name>/`，并在根目录 `marketplace.json` 登记（可用 plugin-creator 的 `upsert-dev-marketplace.mjs --marketplace-path <根目录清单>` 自动登记）。
- 修改 `pele-mermaid` 渲染逻辑时，编辑 `src/pele-mermaid/render-pele.src.mjs`，在 `src/pele-mermaid/` 下运行 `npm install && npm run build` 重新生成自包含 bundle 并提交（构建同时会同步 pele 的 MIT 许可文本）。仓库不含 `node_modules`，克隆后插件开箱即用。
