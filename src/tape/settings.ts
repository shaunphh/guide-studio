import type { ColumnWidth, CoverStyle, GeneratorSettings } from './types'
import { AD_SPACE } from './adTokens'

export const STORAGE_KEY = 'tape-type-settings-v7'
export const ARTBOARD_WIDTH = 1080
export const ARTBOARD_HEIGHT = 1350
/** Covers' lettering keeps this far from every edge (the tokens' safe-cover). */
export const SAFE_MARGIN = AD_SPACE.safeCover
export const TEXT_AREA_WIDTH = ARTBOARD_WIDTH - SAFE_MARGIN * 2

/** A cover's size, and the part of it that lettering is kept to. */
export interface Frame {
  width: number
  height: number
  safe: { left: number; top: number; right: number; bottom: number }
}

/** The 4:5 post: lettering keeps 80px from every edge. */
export const POST_FRAME: Frame = {
  width: ARTBOARD_WIDTH,
  height: ARTBOARD_HEIGHT,
  safe: { left: SAFE_MARGIN, top: SAFE_MARGIN, right: ARTBOARD_WIDTH - SAFE_MARGIN, bottom: ARTBOARD_HEIGHT - SAFE_MARGIN },
}

// Published headline blocks mostly sit in a column about half the cover wide; features run wider.
export const columns: { value: ColumnWidth; label: string; width: number }[] = [
  { value: 'narrow', label: 'Narrow', width: 620 },
  { value: 'medium', label: 'Medium', width: 760 },
  { value: 'wide', label: 'Wide', width: TEXT_AREA_WIDTH },
]
export const columnWidth = (column: ColumnWidth) => columns.find((entry) => entry.value === column)?.width ?? TEXT_AREA_WIDTH

/** The settings a cover style owns: its house look, which can still be adjusted afterwards. */
export const TREATMENT_KEYS = ['perLine', 'tone', 'align', 'mode', 'column', 'hugStrength', 'rotationVariance', 'lineGap'] as const
export type Treatment = Pick<GeneratorSettings, (typeof TREATMENT_KEYS)[number]>

export const stylePresets: Record<CoverStyle, Treatment> = {
  // Most published headline covers are one plain rectangle of tape, left aligned, in a narrow column.
  headline: { perLine: false, tone: 'light', align: 'left', mode: 'plain', column: 'narrow', hugStrength: 1, rotationVariance: 0, lineGap: 2 },
  // Feature covers: capitals on separate torn strips, centred, slightly turned, with gaps between.
  feature: { perLine: true, tone: 'light', align: 'center', mode: 'torn', column: 'wide', hugStrength: 1, rotationVariance: 0.6, lineGap: 12 },
}

export const defaults: GeneratorSettings = {
  headline: 'How to make the most of a weekend visit to Dublin',
  style: 'headline',
  titleCase: true,
  tone: 'light',
  eyebrowEnabled: true,
  eyebrow: 'Breaking',
  coverFormat: 'regular',
  column: 'narrow',
  autoSize: true,
  fontSize: 90,
  align: 'left',
  autoWrap: true,
  perLine: false,
  rotationVariance: 0,
  lineGap: 2,
  hugStrength: 1,
  preferredEdge: 'auto',
  mode: 'plain',
  seed: 18473562,
  seedLocked: false,
}

function oneOf<T>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? value as T : fallback
}

function numberIn(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
}

/** Stored settings are untrusted: older builds and hand edits can leave out-of-range or unknown values. */
export function sanitizeSettings(stored: Record<string, unknown>): GeneratorSettings {
  const text = (value: unknown, fallback: string) => typeof value === 'string' ? value : fallback
  const flag = (value: unknown, fallback: boolean) => typeof value === 'boolean' ? value : fallback
  return {
    headline: text(stored.headline, defaults.headline),
    style: oneOf(stored.style, ['headline', 'feature'] as const, defaults.style),
    titleCase: flag(stored.titleCase, defaults.titleCase),
    tone: oneOf(stored.tone, ['light', 'dark', 'yellow', 'none'] as const, defaults.tone),
    eyebrowEnabled: flag(stored.eyebrowEnabled, defaults.eyebrowEnabled),
    eyebrow: text(stored.eyebrow, defaults.eyebrow),
    coverFormat: oneOf(stored.coverFormat, ['regular', 'series'] as const, defaults.coverFormat),
    column: oneOf(stored.column, ['narrow', 'medium', 'wide'] as const, defaults.column),
    autoSize: flag(stored.autoSize, defaults.autoSize),
    fontSize: Math.round(numberIn(stored.fontSize, 72, 90, defaults.fontSize)),
    align: oneOf(stored.align, ['left', 'center', 'right'] as const, defaults.align),
    autoWrap: flag(stored.autoWrap, defaults.autoWrap),
    perLine: flag(stored.perLine, defaults.perLine),
    rotationVariance: numberIn(stored.rotationVariance, 0, 2, defaults.rotationVariance),
    lineGap: numberIn(stored.lineGap, -8, 20, defaults.lineGap),
    hugStrength: numberIn(stored.hugStrength, 0.82, 1.16, defaults.hugStrength),
    preferredEdge: oneOf(stored.preferredEdge, ['auto', 'left', 'right', 'top', 'bottom'] as const, defaults.preferredEdge),
    mode: oneOf(stored.mode, ['plain', 'clean', 'tape', 'cling', 'rough', 'torn'] as const, defaults.mode),
    seed: Math.max(1, Math.floor(numberIn(stored.seed, 1, 4294967295, defaults.seed))),
    seedLocked: flag(stored.seedLocked, defaults.seedLocked),
  }
}

export function loadSettings(): GeneratorSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    return stored && typeof stored === 'object' && !Array.isArray(stored) ? sanitizeSettings(stored) : defaults
  } catch {
    return defaults
  }
}

export function saveSettings(settings: GeneratorSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Private mode or blocked storage: the tool still works, it just won't remember settings.
  }
}
