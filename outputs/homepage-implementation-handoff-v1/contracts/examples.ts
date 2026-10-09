import type { AlgorithmChain, MediaAsset, MediaBinding, PageContent, PendingAnalysis, PresetPresentation, PublicAppConfig } from "./domain";

/** Deployment-relative paths match media supplied by the handoff's main asset bundle. */
export const mediaManifest = [
  {
    schemaVersion: "1.0", mediaId: "industry-v1", scenarioId: "industry",
    sourceFilename: "01_行业场景_动作样片.mp4", bytes: 7234819,
    sha256: "75a14723f494ceffb8613d87930167b852ee53642e0c7b8fc5df9bea5990a0a5",
    encodedWidth: 1264, encodedHeight: 640, durationSec: 10,
    timebase: "presentation-seconds", frameRate: { numerator: 24, denominator: 1 },
    sources: [{ url: "assets/video/industry.mp4", mime: "video/mp4" }],
    provenance: { kind: "user-provided-ai-generated", generator: "MiniMax H3", displayLabel: "AI 生成场景 · 功能演示" },
    deliveryState: "original-available"
  },
  {
    schemaVersion: "1.0", mediaId: "language-v1", scenarioId: "language",
    sourceFilename: "02_自然语言_动作样片.mp4", bytes: 32206654,
    sha256: "bbb4217ab455d43637ddf556efc8762fb9e3647b403d7ea833792198a5106a66",
    encodedWidth: 1280, encodedHeight: 720, durationSec: 10,
    timebase: "presentation-seconds", frameRate: { numerator: 24, denominator: 1 },
    sources: [{ url: "assets/video/language.mp4", mime: "video/mp4" }],
    provenance: { kind: "user-provided-ai-generated", generator: "MiniMax H3", displayLabel: "AI 生成场景 · 功能演示" },
    deliveryState: "original-available"
  },
  {
    schemaVersion: "1.0", mediaId: "image-v1", scenarioId: "image",
    sourceFilename: "03_以图搜图_动作样片.mp4", bytes: 8252217,
    sha256: "7c129e01036aacb92cee66922b4ec6c55920b7262e0d39d313aba30df549dcaa",
    encodedWidth: 1216, encodedHeight: 672, durationSec: 10,
    timebase: "presentation-seconds", frameRate: { numerator: 24, denominator: 1 },
    sources: [{ url: "assets/video/image-search.mp4", mime: "video/mp4" }],
    provenance: { kind: "user-provided-ai-generated", generator: "MiniMax H3", displayLabel: "AI 生成场景 · 功能演示" },
    deliveryState: "original-available"
  }
] satisfies MediaAsset[];

export const detectionChain: AlgorithmChain = {
  id: "chain-detection", representation: "conceptual-preset",
  nodes: [
    { id: "input", type: "input", label: "视频输入", description: "使用当前预设视频" },
    { id: "preprocess", type: "preprocess", label: "抽帧处理", description: "按任务组织输入画面" },
    { id: "detect", type: "detect", label: "车辆检测", description: "定位画面中的车辆" },
    { id: "output", type: "output", label: "结果输出", description: "展示车辆位置" }
  ],
  edges: [{ from: "input", to: "preprocess" }, { from: "preprocess", to: "detect" }, { from: "detect", to: "output" }]
};
export const entryChain: AlgorithmChain = {
  id: "chain-region-entry", representation: "conceptual-preset",
  nodes: [
    ...detectionChain.nodes.filter(node => node.id !== "output"),
    { id: "track", type: "track", label: "目标跟踪", description: "持续关联同一演示目标" },
    { id: "rule", type: "rule", label: "条件判断", description: "判断目标与关注区域的关系变化" },
    { id: "output", type: "output", label: "事件输出", description: "展示事件与关联画面" }
  ],
  edges: [
    { from: "input", to: "preprocess" }, { from: "preprocess", to: "detect" },
    { from: "detect", to: "track" }, { from: "track", to: "rule" }, { from: "rule", to: "output" }
  ]
};

export const languageChain: AlgorithmChain = {
  id: "chain-language", representation: "conceptual-preset",
  nodes: [
    { id: "input", type: "input", label: "画面输入", description: "使用当前预设画面" },
    { id: "analyze", type: "detect", label: "目标分析", description: "分析画面中的关注目标" },
    { id: "match", type: "semantic-match", label: "文本条件匹配", description: "按预设文字条件匹配目标" },
    { id: "output", type: "output", label: "结果输出", description: "呈现符合条件的演示目标" }
  ],
  edges: [{ from: "input", to: "analyze" }, { from: "analyze", to: "match" }, { from: "match", to: "output" }]
};

export const imageChain: AlgorithmChain = {
  id: "chain-image", representation: "conceptual-preset",
  nodes: [
    { id: "input", type: "input", label: "视频输入", description: "使用当前预设视频" },
    { id: "preprocess", type: "preprocess", label: "抽帧处理", description: "按任务组织输入画面" },
    { id: "detect", type: "detect", label: "车辆检测", description: "定位画面中的车辆" },
    { id: "features", type: "feature-extract", label: "外观特征", description: "表示车辆的外观信息" },
    { id: "match", type: "image-match", label: "相似匹配", description: "关联与参考图外观相似的演示目标" },
    { id: "output", type: "output", label: "结果输出", description: "呈现相似目标，不据此确认唯一身份" }
  ],
  edges: [
    { from: "input", to: "preprocess" }, { from: "preprocess", to: "detect" },
    { from: "detect", to: "features" }, { from: "features", to: "match" }, { from: "match", to: "output" }
  ]
};

/** Playback windows remain omitted until calibrated; query/reference content stays in data. */
export const presetPresentations = [
  { selection: { scenarioId: "industry", presetId: "vehicle-detection" }, mediaId: "industry-v1" },
  { selection: { scenarioId: "industry", presetId: "region-entry" }, mediaId: "industry-v1" },
  {
    selection: { scenarioId: "language", presetId: "find-cyclist", queryId: "find-cyclist-preset" },
    mediaId: "language-v1", query: { text: "查找骑行人员" }
  },
  {
    selection: { scenarioId: "image", presetId: "similar-vehicle", referenceId: "vehicle-reference-preset" },
    mediaId: "image-v1"
    // reference intentionally absent: create and verify the actual crop before enabling matching.
  }
] satisfies PresetPresentation[];

function binding(asset: MediaAsset): MediaBinding {
  return {
    mediaId: asset.mediaId, sha256: asset.sha256,
    encodedWidth: asset.encodedWidth, encodedHeight: asset.encodedHeight,
    durationSec: asset.durationSec, timebase: asset.timebase, frameRate: asset.frameRate
  };
}
const industry = mediaManifest[0];
if (!industry) throw new Error("Example manifest must contain the industry video");

/** Deliberately unfinished: implementing AI must annotate the actual video, not invent boxes. */
export const regionEntryDraft: PendingAnalysis = {
  schemaVersion: "1.0", analysisId: "industry-region-entry-v1",
  scenarioId: "industry", presetId: "region-entry", status: "annotation-required",
  reason: "需要对真实视频逐段标注目标和地面区域，复核后才能启用分析图层。",
  media: binding(industry), chain: entryChain,
  tracks: [], rois: [], rules: [], events: [], evidence: [], cues: []
};

export const publicConfig: PublicAppConfig = {
  schemaVersion: "1.0", mode: "static-demo", basePath: "/",
  contentBaseUrl: "data/", mediaBaseUrl: "",
  flags: { arbitraryTextSearch: false, userImageUpload: false, leadSubmission: false }
};

export const homepageContent: PageContent = {
  schemaVersion: "1.0", locale: "zh-CN", brand: "视界 AIMaster",
  hero: {
    title: ["不止于识别，", "更在于理解"],
    subtitle: "面向无人机巡检与视频分析的视觉理解平台",
    primaryCta: { label: "探索产品能力", href: "#capabilities" }
  },
  tasks: [
    { id: "industry", label: "行业场景", summary: "按任务配置目标与条件" },
    { id: "language", label: "自然语言", summary: "用文字描述关注目标" },
    { id: "image", label: "以图搜图", summary: "用参考图片查找相似目标" }
  ]
};
