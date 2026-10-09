/**
 * Content shapes that the handoff ships as JSON but that are not part of the
 * domain contract. They are grouped here so page code consumes one typed bundle
 * instead of reading raw files.
 */
import type { AlgorithmChain, MediaAsset, PresetPresentation } from './domain'

export interface NavItem {
  label: string
  href: string
}

export interface DisplayMode {
  id: 'analysis' | 'raw' | 'compare'
  label: string
}

export interface InterfaceLabels {
  schemaVersion: '1.0'
  navigation: NavItem[]
  capabilities: {
    eyebrow: string
    title: string
    benefits: string[]
    displayModes: DisplayMode[]
  }
  sections: {
    smallTargets: { title: string; cta: string }
    applications: { title: string; categories: string[] }
    integration: { title: string; summary: string }
    cta: { title: string; button: string; href: string }
  }
  staticNotice: string
  leadNotice: string
  heroMediaStatus: string
}

export interface DesignTokens {
  schemaVersion: '1.0'
  color: Record<string, string>
  layout: { contentMaxPx: number; breakpointsPx: number[]; mobileTouchTargetMinPx: number }
  type: Record<string, number[]>
  radiiPx: Record<string, number>
  motion: Record<string, string | number>
}

export interface HomeBundle {
  labels: InterfaceLabels
  tokens: DesignTokens
  chains: Record<string, AlgorithmChain>
  presets: PresetPresentation[]
  media: MediaAsset[]
}

export interface LeadCopy {
  title: string
  notice: string
  returnLabel: string
}
