/**
 * One Barlow for every AD tool (2 Oct 2026): upright text comes from Barlow's variable font, so any
 * weight can be set, by single units, on its own scale (the stem thickness, 22–188).
 *
 * Two exceptions draw from the static Barlow files instead:
 * - italics, because there is no variable italic;
 * - a run with a character the variable font lacks (Vietnamese, for one), so a word never mixes fonts.
 */

/** The usual weights on the variable font's scale: its named instances. */
export const STEMS: Record<number, number> = { 400: 71, 500: 96, 600: 116, 700: 141, 800: 166, 900: 188 }
export const stemOf = (weight: number) => STEMS[weight] ?? weight
/** The static weight nearest a stem, for runs the variable font can't draw. */
export const nearestStatic = (stem: number) => Number(Object.entries(STEMS).reduce((best, entry) => Math.abs(entry[1] - stem) < Math.abs(best[1] - stem) ? entry : best)[0])

/** Every character BarlowGX-Normal.ttf maps, read from its cmap (the Condensed instance maps the same). */
const GX_RANGES: readonly (readonly [number, number])[] = [[13,13],[32,126],[160,263],[266,275],[278,283],[286,291],[294,295],[298,299],[302,305],[307,307],[310,311],[313,318],[321,328],[330,333],[336,347],[350,359],[362,363],[366,382],[402,402],[461,462],[536,539],[552,553],[710,711],[713,713],[728,733],[768,772],[774,776],[778,780],[786,787],[806,808],[821,824],[916,916],[937,937],[956,956],[960,960],[7808,7813],[7922,7923],[8211,8212],[8216,8218],[8220,8222],[8224,8226],[8230,8230],[8240,8240],[8249,8250],[8260,8260],[8308,8313],[8355,8355],[8364,8364],[8378,8378],[8381,8381],[8467,8467],[8482,8482],[8486,8486],[8494,8494],[8539,8542],[8706,8706],[8710,8710],[8719,8719],[8721,8722],[8725,8725],[8729,8730],[8734,8734],[8747,8747],[8776,8776],[8800,8800],[8804,8805],[9674,9674]]
export const gxCovers = (text: string) => [...text].every((character) => {
  const code = character.codePointAt(0) ?? 0
  return GX_RANGES.some(([low, high]) => code >= low && code <= high)
})
