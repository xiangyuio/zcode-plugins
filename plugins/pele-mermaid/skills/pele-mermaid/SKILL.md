---
name: pele-mermaid
description: Render Mermaid diagrams in chat replies with Pele (pele.run) as a themed inline SVG instead of a raw mermaid code fence. Use whenever a reply would show a Mermaid diagram — flowchart, sequenceDiagram, classDiagram, stateDiagram, erDiagram, pie, gantt, journey, mindmap, timeline, quadrantChart, gitGraph — or when the user asks to draw / 画图 / 可视化 / 出图 for flows, architecture, states or relationships. Not for editing .mmd source files as text.
---

# 用 Pele 渲染 Mermaid 图

当回复中需要展示 Mermaid 图时，不要直接输出 ```mermaid 代码块作为主要展示方式；改用本插件内置的 Pele 渲染器生成主题化 SVG 的 HTML 片段，并在回复中用 `::visualize` 指令内嵌，让图直接显示在对话里。

## 适用与不适用

适用：任何要在对话里"给用户看"的 Mermaid 图（流程图、时序图、类图、状态图、ER 图、饼图、甘特图、旅程图、思维导图、时间线、象限图、gitGraph 等）。

不适用：用户正在把 Mermaid 当**文本编辑**的场景（写/改 `.mmd` 文件、审查语法、教学代码本身）——此时按代码处理，需要配图再另渲染。

## 渲染步骤

渲染脚本是 Pele（零依赖、MIT，Obsidian 官方 Mermaid 渲染库）的封装，依赖已随插件打包，无需 npm install；需要 Node ≥ 18。

1. **确认内联渲染可用**：系统提示中应给出本会话的可视化目录（"Writable, durable visualization directory for this session"）。有 → 走内联流程；没有 → 生成文件后用普通 Markdown 链接引用，并告知用户需点击打开。
2. **写入 Mermaid 源文件**：用 Write 工具把 Mermaid 源码写到 `<可视化目录>/<短横线命名>.mmd`（如 `tcp-handshake.mmd`）。避免用 shell 内联传递多行文本，防止引号转义问题。
3. **执行渲染**（脚本位于本 skill 基础目录的 `../../scripts/render-pele.mjs`，即插件根目录的 `scripts/render-pele.mjs`）：

```bash
node "<插件根目录>/scripts/render-pele.mjs" "<可视化目录>/<name>.mmd" --dir "<可视化目录>" --name "<name>" --title "<图的标题>"
```

可选参数：`--theme dark|light` 固定明/暗（默认 host：跟随对话外观，导出单独查看时才需要固定）。

4. **检查 stdout**：成功时输出单行 JSON `{"ok":true,"path":...,"type":...,"width":...,"height":...}`。
5. **在回复中内嵌**：在本回合的**最终回复**里、图应出现的位置，独占一行输出字面指令（不要放进代码围栏、不要加反引号、不要写成 Markdown 链接）：

```text
::visualize{"path":"C:/Users/.../visualizations/<会话>/<name>.html","title":"<图的标题>"}
```

要求：
- `path` 用渲染脚本返回的绝对路径，**统一改用正斜杠 `/`**（避免 Windows 反斜杠的 JSON 转义问题），必须位于会话可视化目录内。
- 指令只能出现在最终回复中，不要在工具调用间隙的进度文字里输出（宿主只渲染完成的助手消息）。
- 不要同时再给同一张图加链接、附件说明或重复数据表；图的解释写在指令之外的正文里。

## 失败回退

- `ok:false` 且 `stage:"parse"`（退出码 2）：Pele 不支持该语法。先简化写法重试一次；仍失败则回退为普通 ```mermaid 代码块，并说明已回退及原因。
- `stage:"io"` / `stage:"usage"`：检查路径和参数后重试。
- Node 不可用时：回退为普通 ```mermaid 代码块并告知用户。

## 约定

- 多张图：每张图一个 `.mmd` + 一个 `.html` + 一条 `::visualize` 指令，各自放在正文相应位置。
- 保留 `<可视化目录>` 下的 `.mmd` 源文件，便于用户后续修改重渲。
- 生成的片段无边框、宽度自适应，主题自动跟随对话外观；样式与脚本均按每次渲染生成的唯一根 ID 作用域，多图同屏互不干扰。
- 片段图形上方自带头部行：标题居左，右侧依次为"复制 Mermaid 代码"按钮和缩放控件（"−/+ "步进按钮与百分比下拉菜单：50%/100%/200%、适应窗口、重置缩放，范围 25%–400%，放大超宽时图形区域横向滚动）。复制按钮内嵌该图的 Mermaid 源码，点击即复制（宿主禁用剪贴板时自动展开源码框供手动复制），正文无需再重复贴出同一张图的 Mermaid 源码。
