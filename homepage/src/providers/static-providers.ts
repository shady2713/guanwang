/**
 * Static data providers.
 *
 * This is the only module that knows where bytes come from. Replacing these with
 * HTTP/streaming adapters is the documented way to attach a real backend; page,
 * renderer and playback code only ever see the contract types.
 */
import type {
  AnalysisDocument,
  AnalysisProvider,
  ContentProvider,
  DemoSelection,
  LeadInput,
  LeadProvider,
  LeadResult,
  MediaAsset,
  MediaProvider,
  PageContent,
  PresetId,
  PresetPresentation,
  PublicAppConfig,
  RequestContext,
  ScenarioId,
} from '../contracts/domain'
import type { AlgorithmChain, Providers } from '../contracts/domain'
import type { DesignTokens, InterfaceLabels } from '../contracts/app-content'
import { DataContractError, validateAnalysisDocument } from '../contracts/validation'

const MAX_JSON_BYTES = 2 * 1024 * 1024

async function fetchJson(url: string, context: RequestContext, path: string): Promise<unknown> {
  const response = await fetch(url, {
    signal: context.signal,
    headers: { accept: 'application/json' },
  })
  if (!response.ok) {
    throw new DataContractError(`${path} 加载失败：HTTP ${response.status}`)
  }
  const text = await response.text()
  if (text.length > MAX_JSON_BYTES) throw new DataContractError(`${path} 超过 ${MAX_JSON_BYTES} 字节上限`)
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new DataContractError(`${path} 不是合法 JSON`)
  }
}

function requireObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new DataContractError(`${path} 结构不正确`)
  }
  return value as Record<string, unknown>
}

export class StaticContentProvider implements ContentProvider {
  constructor(private readonly config: PublicAppConfig) {}

  async getHome(context: RequestContext): Promise<PageContent> {
    const raw = requireObject(
      await fetchJson(new URL('homepage.content.json', this.config.contentBaseUrl).href, context, 'homepage.content.json'),
      'homepage.content.json',
    )
    if (raw.schemaVersion !== '1.0') throw new DataContractError('homepage.content.json schemaVersion 不受支持')
    return raw as unknown as PageContent
  }

  async getPresets(context: RequestContext): Promise<PresetPresentation[]> {
    const raw = await fetchJson(
      new URL('preset-presentations.json', this.config.contentBaseUrl).href,
      context,
      'preset-presentations.json',
    )
    if (!Array.isArray(raw)) throw new DataContractError('preset-presentations.json 必须是数组')
    return raw as PresetPresentation[]
  }
}

export interface StaticBundle {
  labels: InterfaceLabels
  tokens: DesignTokens
  chains: Record<string, AlgorithmChain>
  presets: PresetPresentation[]
}

/** Loads the static site copy in one round of parallel requests. */
export class StaticContentBundle {
  private cache: Promise<StaticBundle> | null = null
  private loaded: StaticBundle | null = null

  constructor(private readonly config: PublicAppConfig) {}

  /** Synchronous view of already-loaded chains; empty until load() resolves. */
  peekChains(): Record<string, AlgorithmChain> {
    return this.loaded?.chains ?? {}
  }

  load(context: RequestContext): Promise<StaticBundle> {
    if (!this.cache) {
      this.cache = (async () => {
        const [labels, tokens, chainList, presets] = await Promise.all([
          fetchJson(new URL('interface-labels.json', this.config.contentBaseUrl).href, context, 'interface-labels.json'),
          fetchJson(new URL('design-tokens.json', this.config.contentBaseUrl).href, context, 'design-tokens.json'),
          fetchJson(new URL('algorithm-chains.json', this.config.contentBaseUrl).href, context, 'algorithm-chains.json'),
          fetchJson(new URL('preset-presentations.json', this.config.contentBaseUrl).href, context, 'preset-presentations.json'),
        ])
        if (!Array.isArray(chainList)) throw new DataContractError('algorithm-chains.json 必须是数组')
        const chains: Record<string, AlgorithmChain> = {}
        for (const entry of chainList) {
          const chain = requireObject(entry, 'algorithm-chains.json[]') as unknown as AlgorithmChain
          chains[chain.id] = chain
        }
        return {
          labels: requireObject(labels, 'interface-labels.json') as unknown as InterfaceLabels,
          tokens: requireObject(tokens, 'design-tokens.json') as unknown as DesignTokens,
          chains,
          presets: presets as PresetPresentation[],
        }
      })().then((bundle) => {
        this.loaded = bundle
        return bundle
      })
    }
    return this.cache
  }
}

export class StaticMediaProvider implements MediaProvider {
  private cache: Map<string, MediaAsset> = new Map()
  private inflight: Promise<MediaAsset[]> | null = null

  constructor(private readonly config: PublicAppConfig) {}

  private async loadAll(context: RequestContext): Promise<MediaAsset[]> {
    if (!this.inflight) {
      this.inflight = (async () => {
        const raw = requireObject(
          await fetchJson(new URL('media-manifest.json', this.config.contentBaseUrl).href, context, 'media-manifest.json'),
          'media-manifest.json',
        )
        if (!Array.isArray(raw.assets)) throw new DataContractError('media-manifest.json 缺少 assets 数组')
        return raw.assets as MediaAsset[]
      })()
    }
    return this.inflight
  }

  async getMedia(id: string, context: RequestContext): Promise<MediaAsset> {
    const cached = this.cache.get(id)
    if (cached) return cached
    const assets = await this.loadAll(context)
    const found = assets.find((asset) => asset.mediaId === id)
    if (!found) throw new DataContractError(`找不到媒体 ${id}`)
    this.cache.set(id, found)
    return found
  }
}

const ANALYSIS_FILE: Record<string, string> = {
  'industry:vehicle-detection': 'industry-vehicle-detection.json',
  'industry:region-entry': 'industry-region-entry.json',
  'language:find-cyclist': 'language-find-cyclist.json',
  'image:similar-vehicle': 'image-similar-vehicle.json',
}

const MEDIA_FOR_SCENARIO: Record<ScenarioId, string> = {
  industry: 'industry-v1',
  language: 'language-v1',
  image: 'image-v1',
}

export class StaticAnalysisProvider implements AnalysisProvider {
  private cache = new Map<string, AnalysisDocument>()
  private media: MediaProvider
  private chains: () => Record<string, AlgorithmChain>

  constructor(
    private readonly config: PublicAppConfig,
    media: MediaProvider,
    chains: () => Record<string, AlgorithmChain>,
  ) {
    this.media = media
    this.chains = chains
  }

  async getPreset(selection: DemoSelection, context: RequestContext): Promise<AnalysisDocument> {
    const presetId: PresetId =
      selection.scenarioId === 'industry'
        ? selection.presetId
        : selection.scenarioId === 'language'
          ? 'find-cyclist'
          : 'similar-vehicle'
    const key = `${selection.scenarioId}:${presetId}`
    const cached = this.cache.get(key)
    if (cached) return cached

    const file = ANALYSIS_FILE[key]
    if (!file) throw new DataContractError(`没有为 ${key} 准备分析数据`)

    const mediaId = MEDIA_FOR_SCENARIO[selection.scenarioId]
    const asset = await this.media.getMedia(mediaId, context)
    // Analysis documents live next to the content bundle: data/analysis/*.json
    const analysisBase = new URL('../analysis/', this.config.contentBaseUrl).href
    const raw = await fetchJson(new URL(file, analysisBase).href, context, file)
    const { document, warnings } = validateAnalysisDocument(raw, asset, presetId, mediaId, (id) => this.chains()[id])
    if (warnings.length > 0) {
      for (const warning of warnings) console.warn(`[analysis:${key}] ${warning}`)
    }
    this.cache.set(key, document)
    return document
  }
}

export class StaticLeadProvider implements LeadProvider {
  readonly mode = 'disabled' as const

  constructor(private readonly notice: string) {}

  async submit(_input: LeadInput, _context: RequestContext): Promise<LeadResult> {
    // Static build: nothing is sent, nothing is stored. The contract keeps the
    // seam so a real lead service can be dropped in without touching the form.
    return { status: 'unavailable', message: this.notice }
  }
}

export function createProviders(config: PublicAppConfig, bundle: StaticContentBundle, leadNotice: string): Providers {
  const media = new StaticMediaProvider(config)
  return {
    content: new StaticContentProvider(config),
    media,
    analysis: new StaticAnalysisProvider(config, media, () => bundle.peekChains()),
    lead: new StaticLeadProvider(leadNotice),
  }
}
