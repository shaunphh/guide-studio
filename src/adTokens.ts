/**
 * The Alternative Dublin design tokens: the values every AD tool shares (2 October 2026).
 * `ad-tokens.json` is the source. The event guide, Guide Studio and Good Eye copy it with their
 * sync scripts, and it is the tokens file of the Alternative Dublin design system page. Change a
 * value there, then sync each tool. This module reads it the way the tools write their numbers.
 */
import tokens from './ad-tokens.json'
import { STEMS } from './barlow'

interface Token { name: string; value: string }
interface Style { name: string; fontSize: string; lineHeight: number | string; letterSpacing?: string; fontWeight: number }
type Family = 'color' | 'spacing' | 'size' | 'weight' | 'opacity' | 'tape'

/** A token's value as written in the file. */
export function adValue(family: Family, name: string) {
  const token = (tokens[family] as { tokens: Token[] }).tokens.find((entry) => entry.name === name)
  if (!token) throw new Error(`ad-tokens.json has no ${family} "${name}"`)
  return token.value
}
/** A length or number token as a number (px for lengths). */
export const adNumber = (family: Family, name: string) => Number.parseFloat(adValue(family, name))

/** A weight on the variable font's scale as the tools write it: a named stop as its CSS weight (141 is 700), any other as itself (168). */
export const toolWeight = (stem: number) => Number(Object.entries(STEMS).find(([, entry]) => entry === stem)?.[0] ?? stem)

/**
 * A type style: size in px, line height as a multiple of the size, tracking as a share of the
 * size, the weight as the tools write it, and `stem`, the weight on the variable font's own scale.
 */
export function adStyle(name: string) {
  const entry = (tokens.type.groups as { styles: Style[] }[]).flatMap((group) => group.styles).find((style) => style.name === name)
  if (!entry) throw new Error(`ad-tokens.json has no type style "${name}"`)
  const size = Number.parseFloat(entry.fontSize)
  const lineHeight = typeof entry.lineHeight === 'number' ? entry.lineHeight : Number.parseFloat(entry.lineHeight) / size
  const tracking = entry.letterSpacing ? Number.parseFloat(entry.letterSpacing) : 0
  return { size, lineHeight, tracking, weight: toolWeight(entry.fontWeight), stem: entry.fontWeight }
}

const hex = (name: string) => adValue('color', name).toUpperCase()

export const AD_COLOR = {
  yellow: hex('yellow'),
  light: hex('light'),
  dark: hex('dark'),
  greyOnDark: hex('grey-on-dark'),
  greyOnLight: hex('grey-on-light'),
  meta: hex('meta'),
}

/** The type roles Tape Type sets. */
export const AD_TYPE = {
  coverHeadline: adStyle('cover-headline'),
  eyebrow: adStyle('eyebrow'),
  storyTitle: adStyle('story-title'),
  body: adStyle('body'),
  bodyLarge: adStyle('body-large'),
  label: adStyle('label'),
  footer: adStyle('footer'),
}

export const AD_SPACE = {
  safeCover: adNumber('spacing', 'safe-cover'),
  marginInside: adNumber('spacing', 'margin-inside'),
  pictureHeight: adNumber('spacing', 'picture-height'),
}

export const AD_SIZE = {
  logoCover: adNumber('size', 'logo-cover'),
  logoInside: adNumber('size', 'logo-inside'),
  arrow: adNumber('size', 'arrow'),
}

export const AD_PHOTO_DARKEN = adNumber('opacity', 'photo-darken')
