# 视界 AIMaster 官网 · guanwang

面向无人机巡检与视频分析的视觉理解平台官网。当前项目为静态前端，首页以「不止于识别，更在于理解」呈现可配置算法链，依次展示行业场景、自然语言、以图搜图三种能力。

## 从这里开始

`homepage/` 是当前首页工程，使用 Vite + TypeScript。运行时从本地 JSON 获取内容和演示标注，视频上的区域、轨迹和目标框由网页同步渲染。演示标注不代表实时模型推理结果。

```sh
cd homepage
npm ci
npm run dev
```

访问 <http://127.0.0.1:5178/>。预约演示页为 `/demo/`。本次整理使用 Node.js 24.13.0、npm 11.6.2 验证。

```sh
# 在 homepage/ 目录执行
npm run build
npm run preview
```

构建产物为 `homepage/dist/`，预览地址为 <http://127.0.0.1:4178/>。应通过 HTTP 服务访问；完整视频体验需要服务器支持字节范围请求。仓库创建不包含网站上线。

## 仓库内容

| 目录 | 用途 |
| --- | --- |
| [homepage/](homepage/) | 当前首页、预约页、内容和标注数据、网页视频与海报 |
| [website/](website/) | 保留的旧站工程，包含应用场景列表、场景详情和体验页，后续供整合复用 |
| [outputs/homepage-implementation-handoff-v1/](outputs/homepage-implementation-handoff-v1/) | 最新首页设计与开发交接文档、数据契约、三支原视频和素材清单 |
| [outputs/homepage-design-v9/](outputs/homepage-design-v9/) | 首页布局参考 |
| [outputs/application-scenarios-design-v4/](outputs/application-scenarios-design-v4/) | 已选应用场景页设计 |
| [outputs/application-scenarios-design-v2/website-scene-content.json](outputs/application-scenarios-design-v2/website-scene-content.json) | 应用场景数据生成所需的源文件 |
| [runtime/e2e/](runtime/e2e/) | 历史浏览器验收脚本与结果记录 |
| [runtime/tools/](runtime/tools/) / [runtime/calib/](runtime/calib/) | 视频标定辅助脚本、人工标定输入 |
| [docs/整理与提交说明.md](docs/整理与提交说明.md) | 本次清理范围、提交边界与验证记录 |

**`website/dist/` 是旧站手写源码，不是可丢弃的构建目录。** 当前两个工程分别运行；应用场景内容尚未整体并入新首页工程。

## 查看应用场景工程

```sh
cd website
npm run dev
```

访问 <http://127.0.0.1:4173/>。使用 `npm run prepare:scenarios` 可从上表中的源 JSON 重新生成场景目录数据。这个工程没有构建步骤。

## 验证与素材重建

```sh
cd homepage
npm run typecheck
npm run verify:data
npm run media -- --check
npm run build
```

数据和媒体时间轴检查需要 PATH 中可用的 `ffprobe`。重新编码执行 `npm run media`，另需 `ffmpeg`；默认原片目录是 `outputs/homepage-implementation-handoff-v1/assets/video/`，可通过 `MEDIA_SOURCE` 环境变量指定其他目录。日常启动和构建只依赖 `homepage/` 内的文件。

```sh
cd website
npm run check
npm run test:scenarios
npm run test:experience
```

历史 `runtime` 工具部分包含开发电脑上的浏览器、字体和输出路径。它们不参与首页构建，跨电脑运行前需要调整路径和安装相应依赖。旧截图和抽帧已移到本地清理备份，历史验收记录中的相关图片链接可能无法直接打开；记录中的历史结论不代表本次重新执行了浏览器验收。

## 后续接入

后端接入约定见 [首页 README](homepage/README.md) 与 [技术架构与接口契约](outputs/homepage-implementation-handoff-v1/03_技术架构与接口契约.md)。前端已区分内容、媒体、分析数据的提供层，当前预约表单不会向真实服务提交信息。

首屏正式城市背景/视频素材仍待补齐；现有三支能力视频和网页演示图层已纳入工程。会议录音、原始产品 PDF/Word、转写记录、与官网无关的研发资料、依赖目录和临时产物不提交到 GitHub，并继续保留在本地或清理备份中。

