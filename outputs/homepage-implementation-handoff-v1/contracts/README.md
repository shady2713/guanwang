# 契约使用说明

这里是供实现首页的 AI 使用的前端领域契约，不代表已存在的后端协议，也不是可以直接在浏览器执行的完整网站。

- `domain.ts`：媒体、跟踪、区域、算法链、事件、数据来源以及 Provider 边界。
- `examples.ts`：已核对的三段原始视频元数据、四条概念算法链、预设展示内容和显式未完成的标注记录。
- `tsconfig.json`：无第三方类型依赖的严格检查配置。可用项目选定版本的 TypeScript 执行 `tsc -p contracts/tsconfig.json`。

示例中的 `assets/video/*.mp4` 对应移交主包提供的三份配套视频，实施者应按配置的站点 basePath 解析这些相对路径。原始文件位于 `D:/浏览器下载/`，公开数据使用包内路径。示例没有虚构坐标、事件时刻、识别置信度或服务端回执。

`regionEntryDraft.status` 目前为 `annotation-required`。UI 可以显示真实底片及“功能演示”说明，但必须完成实际视频标注、运动校正和结果复核后，才把状态改成 `ready` 并启用识别框/地面区域/事件结果。不能为了让类型通过而填任意坐标。

`playbackWindow` 可限定预设演示短段，但仍使用未剪原片的时间轴，省略时取 `[0, durationSec)`。切场景、切行业预设或重播均回到选定窗口的 `startSec`。这不是裁剪生成新视频的时间映射。

`PresetPresentation` 将示例查询文字、参考图来源及播放窗口放入数据层。示例中的以图搜图 `reference` 尚未配置；待真实目标截图制作并核对后再补 url/mediaId/timeSec/crop，不能生成假路径。

`ready` 仅表示可交给渲染器，不保证分析准确。`authored-demo` 必须提供实际回放复核时间 `reviewedAt`；未来 `algorithm-output` 提供 runId、modelVersion 和 conditionsId，人工复核时间可选，不能因此阻止真实算法结果直接展示。

原项目是原生 HTML/CSS/ES Modules。可以将这里的类型用于 JSDoc 检查，或在独立 Vite + vanilla TypeScript 原型中导入；不需要为了类型文件迁移既有网站。接口返回的 JSON 仍需运行时校验，TypeScript 不会替你验证网络数据。

详细的时间同步、移动端坐标、静态路由、未来接口替换和验收要求见同级目录上方的 `03_技术架构与接口契约.md`。
