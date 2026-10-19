# zcode-plugins

ZCode 插件集合。本仓库根目录同时是一个本地 ZCode 插件市场（`marketplace.json`）。

仓库：https://github.com/xiangyuio/zcode-plugins

| 插件 | 说明 |
| --- | --- |
| [pele-mermaid](./plugins/pele-mermaid) | 对话中展示 Mermaid 图时，用 [Pele](https://pele.run/) 渲染为主题化内联 SVG（亮/暗自适应），替代裸 `mermaid` 代码块 |

## 添加本市场

- **本地**：插件市场 → 添加 → 添加插件市场，粘贴本仓库根目录，然后在“个人”中找到 `xiangyuio-zcode-plugins` 市场安装插件。
- **GitHub**：插件市场 → 添加 → 添加插件市场，粘贴 `https://github.com/xiangyuio/zcode-plugins`（具体以客户端支持的源格式为准）。

## 目录结构

```text
.
├── marketplace.json              # 市场清单（source 相对仓库根解析）
├── src/
│   └── pele-mermaid/             # 开发源码（构建用，不随插件安装）
│       ├── render-pele.src.mjs   # 渲染脚本源码
│       ├── build.mjs             # npm run build 重新生成 bundle
│       └── package.json          # 构建依赖（pele + esbuild）
└── plugins/
    └── pele-mermaid/             # 安装内容：清单 + skill + 运行时 bundle
        ├── .zcode-plugin/plugin.json
        ├── skills/pele-mermaid/SKILL.md
        └── scripts/
            ├── render-pele.mjs          # 构建产物（已提交），自包含、克隆即用
            └── vendor/pele-LICENSE.txt  # pele 的 MIT 许可文本
```

## 开发

- 新插件的开发源码放 `src/<name>/`，安装内容（`.zcode-plugin/plugin.json`、`skills/`、运行时脚本）放 `plugins/<name>/`，并在 `marketplace.json` 登记（可用 plugin-creator 的 `upsert-dev-marketplace.mjs --marketplace-path <根目录清单>` 自动登记）。
- 修改源码后递增插件版本，在客户端“市场源 → 刷新该市场”，再到插件详情点击“更新”。
- `pele-mermaid` 的渲染脚本需要 Node ≥ 18；pele 已打包进 `plugins/pele-mermaid/scripts/render-pele.mjs`，克隆即用，仓库不含 `node_modules`。修改渲染逻辑时编辑 `src/pele-mermaid/render-pele.src.mjs`，在 `src/pele-mermaid/` 下运行 `npm install && npm run build` 重新生成并提交 bundle（构建同时会同步 LICENSE）。
