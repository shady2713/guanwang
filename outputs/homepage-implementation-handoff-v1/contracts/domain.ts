/** Homepage handoff v1. Frontend domain contract; NOT an existing backend API. */
export type SchemaVersion = "1.0";
export type ScenarioId = "industry" | "language" | "image";
/** Opaque identifier; examples use three demo IDs, future services may return others. */
export type MediaId = string;
export type PresetId = "vehicle-detection" | "region-entry" | "find-cyclist" | "similar-vehicle";
export type Seconds = number;
/** Runtime validation: finite, [0, 1], encoded source-frame coordinates. */
export interface Point01 { x: number; y: number }
export interface Box01 extends Point01 { width: number; height: number }
export interface Rational { numerator: number; denominator: number }
/** Half-open interval [startSec, endSec); end is exclusive. */
export interface TimeRange { startSec: Seconds; endSec: Seconds }

export interface MediaBinding {
  mediaId: MediaId;
  /** Exact original bytes; lower-case 64-character hex. */
  sha256: string;
  encodedWidth: number;
  encodedHeight: number;
  durationSec: number;
  /** Presentation timestamp expressed on HTMLMediaElement.currentTime timeline. */
  timebase: "presentation-seconds";
  frameRate: Rational;
  /** Read from ffprobe when preparing assets; not guessed from the frame rate. */
  encodedTimeBase?: Rational;
}

export interface MediaAsset extends MediaBinding {
  schemaVersion: SchemaVersion;
  scenarioId: ScenarioId;
  sourceFilename: string;
  bytes: number;
  /** Deployment-relative paths; this handoff's main asset bundle supplies the demo files. */
  sources: Array<{ url: string; mime: "video/mp4" | "video/webm" }>;
  posterUrl?: string;
  provenance: {
    kind: "user-provided-ai-generated" | "real-capture";
    displayLabel: string;
    generator?: string;
  };
  /** Set only after checking encoding, aspect ratio, orientation, and unchanged framing. */
  deliveryState: "original-available" | "web-rendition-verified";
  /** A compressed rendition needs its own file hash and verified timeline binding. */
  renditions?: Array<{
    id: string;
    url: string;
    sha256: string;
    width: number;
    height: number;
    durationSec: number;
    sameFieldOfView: true;
    timeline: "identical-presentation-timeline";
  }>;
}

export type AnalysisProvenance =
  | { kind: "authored-demo"; displayLabel: "功能演示"; annotationMethod: "manual-reviewed" | "tracker-assisted-reviewed" }
  | { kind: "algorithm-output"; displayLabel: string; runId: string; modelVersion: string; conditionsId: string };

/** A confirmed same-object gap/occlusion splits segments; uncertain identity gets a new track ID. */
export interface TrackSegment {
  id: string;
  interval: TimeRange;
  interpolation: "linear" | "step";
  /** Limit interpolation between reviewed samples; frames farther apart are hidden. */
  maxInterpolationGapSec: number;
  samples: Array<{
    timeSec: Seconds;
    box: Box01;
    /** Optional ground-contact anchor, not assumed to be the vehicle center. */
    anchor?: Point01;
  }>;
}
export interface ObjectTrack {
  id: string;
  label: string;
  className: "vehicle" | "cyclist" | "person" | "other";
  segments: TrackSegment[];
  /** No cosmetic confidence values. Supply only real measurements with provenance. */
  measurement?: { confidence: number; runId: string };
}

/** Screen-projected ground polygon. Each frame may differ with camera motion. */
export interface ProjectedRoiSegment {
  interval: TimeRange;
  interpolation: "linear" | "step";
  maxInterpolationGapSec: number;
  /** Vertices keep identical winding, order and count within one segment. */
  samples: Array<{ timeSec: Seconds; vertices: Point01[] }>;
}
export interface ProjectedRoi {
  id: string;
  label: string;
  coordinateSpace: "encoded-frame-normalized";
  role: "ground-region";
  segments: ProjectedRoiSegment[];
}

export interface ChainNode {
  id: string;
  type: "input" | "preprocess" | "detect" | "track" | "rule" | "output" | "semantic-match" | "feature-extract" | "image-match";
  label: string;
  description: string;
}
export interface AlgorithmChain {
  id: string;
  /** Node/edge presentation explains configuration; it is not a measured runtime trace. */
  representation: "conceptual-preset";
  nodes: ChainNode[];
  edges: Array<{ from: string; to: string }>;
}
export interface RegionEntryRule {
  id: string;
  type: "outside-to-inside";
  trackIds: string[];
  roiId: string;
  anchor: "annotated-ground-contact" | "box-bottom-center";
  boundary: "inside";
  /** Continuous, observable inside duration required after crossing before confirmation. */
  minimumInsideSec: number;
}
export interface EvidenceReference {
  id: string;
  mediaId: MediaId;
  timeSec: Seconds;
  imageUrl?: string;
  /** Only set when the image is a verified extraction of this same clip/time. */
  extractedFromMedia: boolean;
}
export interface AnalysisEvent {
  id: string;
  mediaId: MediaId;
  kind: "region-entry" | "target-found" | "similar-target-found";
  /** Event confirmation time. Region entry: crossing + required continuously observed dwell. */
  timeSec: Seconds;
  /** Optional first observed boundary crossing, separate from confirmation/evidence time. */
  observedCrossingTimeSec?: Seconds;
  /** Recomputed from current media time, not appended repeatedly after a seek. */
  /** Validation: visible.startSec >= timeSec. */
  visible: TimeRange;
  trackIds: string[];
  roiId?: string;
  title: string;
  evidenceIds: string[];
}
export interface PresentationCue {
  id: string;
  range: TimeRange;
  kind: "node-emphasis" | "query-reveal" | "reference-reveal";
  targetId: string;
  /** Explicitly animation choreography, never evidence of algorithm latency. */
  purpose: "explanation";
}

interface AnalysisBase {
  schemaVersion: SchemaVersion;
  analysisId: string;
  scenarioId: ScenarioId;
  /** Present for preset playback; future arbitrary jobs use runId instead. */
  presetId?: PresetId;
  runId?: string;
  media: MediaBinding;
  /** Uncut source timeline, [startSec, endSec). Defaults to [0, media.durationSec). */
  playbackWindow?: TimeRange;
  chain: AlgorithmChain;
}
/** Pending records carry no pretend coordinates, events, or measured confidence. */
export interface PendingAnalysis extends AnalysisBase {
  status: "annotation-required";
  reason: string;
  tracks: [];
  rois: [];
  rules: [];
  events: [];
  evidence: [];
  cues: [];
}
interface ReadyAnalysisFields extends AnalysisBase {
  /** Ready for the renderer; does not certify accuracy or imply human review. */
  status: "ready";
  tracks: ObjectTrack[];
  rois: ProjectedRoi[];
  rules: RegionEntryRule[];
  events: AnalysisEvent[];
  evidence: EvidenceReference[];
  cues: PresentationCue[];
}
export type ReadyAnalysis = ReadyAnalysisFields & (
  | {
      provenance: Extract<AnalysisProvenance, { kind: "authored-demo" }>;
      /** Required only for manually authored or tracker-assisted demonstration data. */
      reviewedAt: string;
    }
  | {
      provenance: Extract<AnalysisProvenance, { kind: "algorithm-output" }>;
      /** Optional human review; live algorithm output may be rendered without it. */
      reviewedAt?: string;
    }
);
export type AnalysisDocument = PendingAnalysis | ReadyAnalysis;

export type DemoSelection =
  | { scenarioId: "industry"; presetId: "vehicle-detection" | "region-entry" }
  | { scenarioId: "language"; presetId: "find-cyclist"; queryId: "find-cyclist-preset" }
  | { scenarioId: "image"; presetId: "similar-vehicle"; referenceId: "vehicle-reference-preset" };

export interface PresetReferenceImage {
  url: string;
  /** Reference is a verified extraction of this source clip and time. */
  mediaId: MediaId;
  timeSec: Seconds;
  /** Optional crop of the source frame in encoded-frame-normalized coordinates. */
  crop?: Box01;
}
interface PresetPresentationBase {
  mediaId: MediaId;
  /** Source-timeline seconds; must match AnalysisDocument.playbackWindow if both exist. */
  playbackWindow?: TimeRange;
}
export type PresetPresentation = PresetPresentationBase & (
  | { selection: Extract<DemoSelection, { scenarioId: "industry" }>; query?: never; reference?: never }
  | { selection: Extract<DemoSelection, { scenarioId: "language" }>; query: { text: string }; reference?: never }
  | {
      selection: Extract<DemoSelection, { scenarioId: "image" }>;
      query?: never;
      /** Absent until the actual verified reference asset exists; matching stays disabled. */
      reference?: PresetReferenceImage;
    }
);

export interface RequestContext { requestId: string; signal: AbortSignal }
export interface PageContent {
  schemaVersion: SchemaVersion;
  locale: "zh-CN";
  brand: string;
  hero: { title: string[]; subtitle: string; primaryCta: { label: string; href: string } };
  tasks: Array<{ id: ScenarioId; label: string; summary: string }>;
}
export interface ContentProvider {
  getHome(context: RequestContext): Promise<PageContent>;
  getPresets(context: RequestContext): Promise<PresetPresentation[]>;
}
export interface MediaProvider {
  getMedia(id: MediaId, context: RequestContext): Promise<MediaAsset>;
}
export interface AnalysisProvider {
  getPreset(selection: DemoSelection, context: RequestContext): Promise<AnalysisDocument>;
}

/** Future input contract. Disabled in the static homepage. Backend adapters may map it. */
export type AnalysisJobInput = {
  mediaId: string;
  query:
    | { kind: "pipeline"; configurationId: string }
    | { kind: "natural-language"; text: string }
    | { kind: "reference-image"; assetId: string };
};
/** Full snapshots first; streaming deltas require a separate schema/version decision. */
export interface AnalysisUpdate {
  schemaVersion: SchemaVersion;
  runId: string;
  sequence: number;
  document: ReadyAnalysis;
}
export interface FutureJobProvider {
  createJob(input: AnalysisJobInput, context: RequestContext): Promise<{ runId: string }>;
  /** May be backed by SSE, fetch streaming, WebSocket, or polling. */
  subscribe(runId: string, context: RequestContext): AsyncIterable<AnalysisUpdate>;
}

export interface LeadInput {
  companyName: string;
  contact: string;
  context?: { source: "homepage"; scenarioId?: ScenarioId };
}
export type LeadResult =
  | { status: "unavailable"; message: string }
  | { status: "received"; receiptId: string };
export interface LeadProvider {
  mode: "disabled" | "http";
  submit(input: LeadInput, context: RequestContext): Promise<LeadResult>;
}
export interface Providers {
  content: ContentProvider;
  media: MediaProvider;
  analysis: AnalysisProvider;
  lead: LeadProvider;
  /** Absence means arbitrary input/upload and real analysis are unavailable. */
  jobs?: FutureJobProvider;
}
export interface PublicAppConfig {
  schemaVersion: SchemaVersion;
  mode: "static-demo" | "connected";
  basePath: string;
  contentBaseUrl: string;
  mediaBaseUrl: string;
  /** Optional public origin/path. Never store API keys/tokens in this object. */
  apiBaseUrl?: string;
  flags: {
    arbitraryTextSearch: boolean;
    userImageUpload: boolean;
    leadSubmission: boolean;
  };
}
