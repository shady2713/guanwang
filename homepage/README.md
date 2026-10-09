# 视界 AIMaster 首页

面向无人机巡检与视频分析的视觉理解平台首页：用「不止于识别，更在于理解」呈现可配置的 AIMasterflow AI 识别算法链。本目录是**全静态交付物**，没有后端、没有构建期以外的运行时依赖，页面上的每一帧分析标记都是手工逐帧校准的演示标注（标注来源标记为「功能演示」）。

---

## 1. 安装与启动

| 命令 | 作用 | 访问地址 |
| --- | --- | --- |
| `npm install` | 安装开发依赖（Vite、TypeScript、@types/node） | — |
| `npm run dev` | 启动开发服务器 | http://127.0.0.1:5178/ |
| `npm run build` | 先 `tsc --noEmit` 全量类型检查，再 `vite build` | 产物在 `dist/` |
| `npm run preview` | 预览 `dist/` 构建产物 | http://127.0.0.1:4178/ |
| `npm run typecheck` | 只做全量类型检查（`tsc --noEmit`），不产出文件 | — |
| `npm run verify:data` | 校验 `data/` 下全部 JSON：媒体文件存在性与 sha256/字节数、ffprobe 时间轴、分析文档的媒体绑定、样本间隔、事件与证据引用、cue 指向 | 退出码非 0 表示有错误 |
| `npm run media` | 用 ffmpeg 从原片重新生成三支网页派生版并比对时间轴；`-- --check` 只校验不重编码 | 需要 ffmpeg；原片路径可用 `MEDIA_SOURCE` 覆盖 |

端口写在 `vite.config.ts` 里（`server.port = 5178`、`preview.port = 4178`，host 均为 `127.0.0.1`），不是 Vite 默认值。

**部署**：`vite.config.ts` 中 `base: './'`，产物是相对路径引用，`dist/` 目录可以整体丢到任意静态服务器或子路径下直接打开，不需要 Node 运行时。静态服务器必须支持 `Range` 请求（视频按字节范围读取），Vite dev/preview 已内置。

`npm run verify:data` 当前输出：3 个媒体资产、4 份分析标注、0 错误 0 警告。

---

## 2. 目录结构

| 路径 | 作用 |
| --- | --- |
| `index.html` | 首页骨架：`header#site-header` / `main#home` / `footer#site-footer` + noscript 说明，入口脚本 `/src/main.ts` |
| `demo/index.html` | 独立预约页 `/demo/` 的入口，入口脚本 `/src/demo-main.ts` |
| `src/config/app-config.ts` | 运行配置：`schemaVersion`、`basePath`、data/media 基址、三个功能开关 |
| `src/contracts/` | 数据契约类型（`app-content.ts` / `domain.ts`）与运行时数据门禁（`validation.ts`） |
| `src/providers/static-providers.ts` | 四个静态数据提供层，**唯一知道「字节从哪来」的模块** |
| `src/pages/` | 页面区块：`home` / `navigation` / `hero` / `static-sections` / `capability-stage`（演示舞台） |
| `src/media/stage-controller.ts` | 播放器封装：媒体时间是页面唯一时间源，播放/暂停/跳转/重播/播放窗口裁剪/媒体错误回退 |
| `src/render/stage-overlay.ts` | 分析图层（区域、轨迹、目标框、事件提示），纯 SVG 叠加在视频内容矩形上 |
| `src/render/viewport-mapper.ts` | 把编码画幅坐标映射到视频内容矩形（处理 letterbox） |
| `src/domain/` | 采样插值（`sampling.ts`）、区域进入几何推导（`region-entry.ts`）、分析状态（`analysis-state.ts`） |
| `src/styles/` | `tokens.css` / `base.css` / `layout.css` / `stage.css` |
| `scripts/verify-data.mjs` | 不依赖浏览器的数据体检脚本（对应 `npm run verify:data`） |
| `scripts/build-media.mjs` | 重新生成并校验网页派生版（对应 `npm run media`） |
| `data/content/` | 站点文案、算法链、预设编排、媒体清单等 JSON |
| `data/analysis/` | 四个任务预设的分析标注 JSON |
| `public/media/` | 网页播放用的派生版视频、海报图、参考图 |
| `dist/` | `npm run build` 的产物（含 `data/` 与 `media/` 的副本） |
| `docs/验收记录.md` | 逐条验收记录、数据校验结论、截图清单、未验证项 |
| `../runtime/e2e/` | Playwright 验收脚本与截图（校验工具，不参与构建） |
| `../runtime/tools/` | 标注校准、抽帧裁切参考图、几何可视化等辅助脚本 |

---

## 3. 数据文件

所有内容都在 `data/` 下，运行时用 `fetch` 读取；`vite.config.ts` 的 `handoffData()` 插件负责 dev 期把 `/data/*` 限制在 `data/` 目录内，越界返回 403、不存在返回 404，构建时把整棵 `data/` 拷进 `dist/data/`。单个 JSON 超过 2 MB 会被 `static-providers.ts` 拒绝。

| 文件 | 作用 | 谁读它 |
| --- | --- | --- |
| `data/content/homepage.content.json` | 品牌、Hero 标题与副标题、主 CTA、三个任务的顺序与说明 | `StaticContentProvider.getHome()` |
| `data/content/interface-labels.json` | 导航、能力区、应用场景、部署集成、CTA、观看方式、静态提示语、`leadNotice`、`heroMediaStatus` | `StaticContentBundle.load()` |
| `data/content/design-tokens.json` | 设计令牌（颜色/间距等），供界面取用 | `StaticContentBundle.load()` |
| `data/content/algorithm-chains.json` | 四条算法链的节点与边（`chain-detection` / `chain-region-entry` / `chain-language` / `chain-image`） | `StaticContentBundle.peekChains()`，同时供分析文档按 `chainId` 解析 |
| `data/content/preset-presentations.json` | 每个预设用哪支媒体、播放窗口、自然语言查询词、以图搜图的参考图与裁切坐标 | `StaticContentProvider.getPresets()` |
| `data/content/media-manifest.json` | 三支源视频的 sha256、编码尺寸、时长、timebase、海报、网页派生版（rendition）及其 sha256 与验证记录 | `StaticMediaProvider` |
| `data/analysis/industry-vehicle-detection.json` | 行业场景·车辆检测：4 节点链、车辆轨迹、无区域/无规则/无事件 | `StaticAnalysisProvider` |
| `data/analysis/industry-region-entry.json` | 行业场景·区域进入：6 节点链、车辆轨迹、地面区域多边形、`outside-to-inside` 规则与进入事件 | `StaticAnalysisProvider` |
| `data/analysis/language-find-cyclist.json` | 自然语言·查找骑行人员：4 节点链、三条骑行者轨道、命中事件 | `StaticAnalysisProvider` |
| `data/analysis/image-similar-vehicle.json` | 以图搜图·外观相似车辆：6 节点链、两条候选车轨道、相似目标事件 | `StaticAnalysisProvider` |

**预设与分析文件的对应关系**是 `static-providers.ts` 里的显式白名单（`ANALYSIS_FILE`），不是路径约定：这样任何分析文件都必须被代码显式引用一次，不会因为文件名变化而静默读错数据。`MEDIA_FOR_SCENARIO` 同样把三个场景固定到三支不同的媒体。

---

## 4. 新增一个任务预设

绝大多数情况只需要改数据。以「在自然语言场景下再加一个预设」为例：

1. **复制一份分析标注**：`data/analysis/` 下新建 `xxx.json`，沿用现有文件的结构。必填项：
   - `schemaVersion: "1.0"`、`timebase`、`frameRate`
   - `binding`：`mediaId`、`sha256`、`encodedWidth`、`encodedHeight`、`durationSec` 必须与 `media-manifest.json` 中该资产**逐字符一致**，否则运行时会拒绝加载（见第 6 节）
   - `playbackWindow`：必须落在媒体时长内，且与 `preset-presentations.json` 里写的一致
   - `status`：**标定没做完就写 `annotation-required` 并给出 `reason`**，此时页面会显示「分析标记待配置：…」并且不画任何叠加层；标定完成后再改成 `ready` 并补 `tracks` / `rois` / `rules` / `events`
   - `provenance`：`kind: "authored-demo"` 时必须带 `reviewedAt`
2. **登记预设**：在 `data/content/preset-presentations.json` 增加一条，写 `selection.scenarioId` + `selection.presetId`、`mediaId`、`playbackWindow`，需要的话再加 `query` 或 `reference`。
3. **需要新算法链时**：在 `data/content/algorithm-chains.json` 增加一条；节点 `id` 不能重复，`edges` 必须指向已存在的节点。
4. **加一行映射**：在 `src/providers/static-providers.ts` 的 `ANALYSIS_FILE` 里增加 `'<scenario>:<preset>' → '<文件名>.json'`。这是唯一必需的代码改动，而且是刻意的白名单。

如果新增的是**全新场景**（第三个场景之外），还需要动类型与 UI：`src/contracts/domain.ts` 的 `ScenarioId`、`static-providers.ts` 的 `MEDIA_FOR_SCENARIO`、`src/pages/capability-stage.ts` 的 `INDUSTRY_PRESETS` 与 `renderToolbar()` 的分支。

**不要**用随机框或编造事件来"填满"标注：`validation.ts` 会拒绝非法数据，而 `annotation-required` 是被支持的正当状态。

---

## 5. 换成真实后端

要接真实服务，只需要替换 `src/providers/static-providers.ts` 里的实现，**其余代码不动**：

| 提供层 | 现在做什么 | 换成后端时要做什么 |
| --- | --- | --- |
| `StaticContentProvider` | `fetch` `homepage.content.json` / `preset-presentations.json` | 改成读 CMS 或接口，保持 `getHome()` / `getPresets()` 的返回形状 |
| `StaticContentBundle` | 并行拉 `interface-labels` / `design-tokens` / `algorithm-chains` / `preset-presentations` | 可合并成一次接口请求；`peekChains()` 仍需能按 id 解析链 |
| `StaticMediaProvider` | 读 `media-manifest.json` 的 `assets`，按 `mediaId` 查 | 换成媒体服务返回的资产描述，字段形状不变 |
| `StaticAnalysisProvider` | 按 `ANALYSIS_FILE` 拉本地 JSON，再交给 `validateAnalysisDocument()` | 换成模型/算法服务返回的结果；**继续走同一个 `validation.ts` 门禁**，不要绕过 |
| `StaticLeadProvider` | `mode = 'disabled'`，`submit()` 直接返回 `{ status: 'unavailable', message: notice }` | 换成真实提交：鉴权、限流、幂等、回执编号（返回 `status: 'received'` 时页面才显示编号） |

配套要改的开关在 `src/config/app-config.ts`：`flags.arbitraryTextSearch`、`flags.userImageUpload`、`flags.leadSubmission` 目前全是 `false`，页面据此**明说**不支持而不是假装支持。逐项改 `true` 的同时，需要在 UI 层实现对应分支，否则只是把限制藏起来。

`src/contracts/` 的类型和 `validation.ts` 的校验规则建议原样保留：媒体绑定（sha256/尺寸/时长/timebase）、样本严格递增与插值上限、ROI 坐标空间、规则与事件的引用完整性，都是与后端无关的数据正确性保证。

---

## 6. 媒体派生与运行时校验

**原片不动，网页用另存的派生版。** `media-manifest.json` 里三支源视频（`01_行业场景_动作样片.mp4` / `02_自然语言_动作样片.mp4` / `03_以图搜图_动作样片.mp4`）的 `sha256` 是原片的指纹；网页实际播放的是 `public/media/*.web.mp4` 这三个派生版，它们各自登记了 `renditions[].sha256` 和 `renditionVerification`：

| 资产 | 源文件 | 原始尺寸 | 派生版 | 派生版尺寸 | 时长 / 帧率 |
| --- | --- | --- | --- | --- | --- |
| `industry-v1` | `01_行业场景_动作样片.mp4` | 1264×640 | `media/industry.web.mp4` | 1024×518 | 10s / 24fps |
| `language-v1` | `02_自然语言_动作样片.mp4` | 1280×720 | `media/language.web.mp4` | 1024×576 | 10s / 24fps |
| `image-v1` | `03_以图搜图_动作样片.mp4` | 1216×672 | `media/image-search.web.mp4` | 1024×566 | 10s / 24fps |

- **时间轴映射**：派生版只做重编码与缩放（`ffmpeg libx264 crf27 preset slow, yuv420p, -an, -g 48, +faststart`），`startTimeSec = 0`、时长 10s 帧数 240 与原片一致（`framesOriginal 240 = framesRendition 240`），所以 `presentation-seconds` 时间基在两侧通用。
- **坐标可复用**：标注坐标是编码画幅的 0..1 归一化值，派生版与原片同视野同时间轴，因此 `normalizedCoordinatesReusable: true`，标注不需要重做。
- **音频**：派生版用 `-an` 去掉了音轨（网页演示不需要），原片音轨保持原样未改动。
- **首屏只下载一支视频**：`<video preload="none">` + IntersectionObserver 可见性判断，切换任务标签才加载下一支 `.web.mp4`。

**运行时数据门禁**（`src/contracts/validation.ts`，浏览器里真实执行）：

- `binding.mediaId`、`sha256`、`encodedWidth`、`encodedHeight`、`durationSec` 与媒体清单**逐项比对**，任一不符就抛 `DataContractError`：「分析数据与媒体构建不一致：… 旧标注不能套用到新版本媒体。」——这正是防止「换了视频却复用旧标注」的机制。
- `timebase` 必须一致；`playbackWindow.endSec` 不得超过媒体时长；`status` 只能是 `ready` 或 `annotation-required`。
- 轨道样本时间必须**严格递增**且落在片段区间内，相邻间隔不得超过该段声明的 `maxInterpolationGapSec`（超过直接报错「不能安全插值」；超过上限的 75% 会产生一条 warning，提示插值期间位置可能有偏差）。
- 目标框宽高为正且不越界（`x + w`、`y + h ≤ 1.0001`）；区域多边形必须声明 `coordinateSpace: "encoded-frame-normalized"`、顶点不少于 3 个、同一片段各样本顶点数一致。
- 规则只能引用存在的轨道与区域；事件的 `visible.startSec` 不得早于 `timeSec`，引用的轨道/区域/证据必须存在。
- 所有校验产生的 warning 会通过 `console.warn` 输出，不会静默吞掉。

**区域进入的时间不是抄来的，是推导的**：`src/domain/region-entry.ts` 用固定 10ms 网格从标注几何重新算出「越界时刻」和「确认时刻」（确认时刻 = 越界后持续 `minimumInsideSec` 的第一个仍在区域内的网格点），声明时间与推导时间相差超过 0.02s 时页面会打告警。示例数据里 `observedCrossingTimeSec 1.26 + minimumInsideSec 0.40 = 1.66`，与事件的 `timeSec 1.66` 一致。

---

## 7. 已知缺失的素材

| 缺什么 | 现状 | 补齐方式 |
| --- | --- | --- |
| 首页 Hero 的独立干净背景图（城市水面、门形高楼与无人机） | `src/pages/hero.ts` 已把挂载点、文案、图注和状态提示全部做好，`img` 元素存在但没有 `src`；状态标记为 `clean-background-required`，页面直接写明「主视觉素材待补」。没有拿别的城市图或行业视频凑数 | 把图放进 `public/media/hero/` 下的同名文件即可，不需要改布局（该目录目前不存在） |
| 行业场景视频 5.25 秒之后的标注 | 区域进入/车辆检测的 `playbackWindow` 只到 5.25s；再往后的画面没有逐帧标定 | 需要时用 `../runtime/tools/` 里的抽帧与标定脚本补标 |
| 真实业务 API / 模型输出 | 现有分析数据全部是人工校准的演示标注，`provenance.displayLabel` 为「功能演示」 | 接入后端后由服务返回，`StaticAnalysisProvider` 换实现即可 |
| 预约提交的真实后端 | `StaticLeadProvider` 为 `disabled` 模式；提交接口、鉴权、限流均未实现、未联调 | 见第 5 节 |
| 带音轨的网页版视频 | 派生版用 `-an` 去掉了音频 | 若需要，另做一份保留音轨的派生版并更新 manifest |

---

## 8. 未验证项

本次验收只在 **Chromium**（Playwright 自带 Chromium，桌面 1440×900 / 1360×800 / 2560×1440，移动 320×740 / 390×844，平板 768×1024）下完成。**iOS / Android 真机、Safari、Firefox、Edge 均未测试**；`LCP / CLS / INP` 未做实测（首屏只加载一支视频是设计约束，不是实测结论）；两支非首屏视频的下载时机、错误回退的浏览器差异表现都未验证。

完整逐条记录、已验证证据与截图清单见 [`docs/验收记录.md`](docs/验收记录.md)。
