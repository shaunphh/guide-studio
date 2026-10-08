import { mapHeaders, normalizeRows, rowsFromCsv } from './event-source.js'
import { crc32 } from './zip'
import { readBounds, type CoverBounds } from './cover-bounds'
import { adNumber, adStyle, adValue } from './adTokens'

export type Series = 'picks' | 'new'
export type Crop = { x: number; y: number; zoom: number }
export type Story = { id: string; title: string; body: string; handle: string; date: string; time: string; venue: string; photo: string; coverEligible: boolean; crop: Crop; imageHeight: number | null }
export type Cover = { title: string; subtitle: string; date: string; slots: string[]; photos: string[]; backgrounds: Record<Series,CoverBounds | null>; backgroundsRevision: typeof BACKGROUNDS_REVISION; crops: Crop[]; position: number; scrim: number; layout: 2 | 4; orientation: 'vertical' | 'horizontal'; logoPosition: 'left' | 'right' | 'off'; markColour: 'series' | 'yellow' | 'white' | 'dark'; divider: 'dark' | 'light' | 'yellow'; subtitlePosition: 'bottom' | 'tape' }
export type Issue = { id: string; name: string; series: Series; cover: Cover; stories: Story[]; updated: string; sample: boolean }
export type Brand = { revision: 8; bodySize: number; bodyWeight: 400 | 500; titleSize: number; titleWeight: number; dateWeight: number; lineHeight: number; margin: number; imageHeight: number; coverSize: number; coverTracking: number; coverLineHeight: number; subtitleSize: number; lightBody: string; darkBody: string; light: string; dark: string; yellow: string }
export type Library = { version: 1; activeId: string; issues: Issue[]; brand: Brand }
// The AD palette shared with Tape Type and the Event Guide (2 Oct): yellow #FFED1F, light #F0F0F0,
// dark #101010, grey on black #C2C2C2. Pictures 500 (a little under Tape Type's 540 since 5 Oct, so the
// stories the team writes fit). Body text Regular 400.
// Story titles: capitals at the variable font's 168 in every tool.
// The house style starts from the shared AD tokens (ad-tokens.json, synced from Tape Type by
// scripts/sync-tokens.mjs). House style edits still adjust a library's own copy.
const bodyStyle = adStyle('body'), titleStyle = adStyle('story-title-carousel'), coverStyle = adStyle('cover-carousel')
export const BASE_BRAND: Brand = { revision: 8, bodySize: bodyStyle.size, bodyWeight: bodyStyle.weight === 500 ? 500 : 400, titleSize: titleStyle.size, titleWeight: titleStyle.stem, dateWeight: adStyle('date-strip').stem, lineHeight: bodyStyle.lineHeight, margin: adNumber('spacing', 'margin-inside'), imageHeight: adNumber('spacing', 'picture-height-carousel'), coverSize: coverStyle.size, coverTracking: Math.round(coverStyle.tracking * 1000) / 10, coverLineHeight: coverStyle.lineHeight, subtitleSize: adStyle('supporting-line').size, lightBody: adValue('color', 'grey-on-light'), darkBody: adValue('color', 'grey-on-dark'), light: adValue('color', 'light'), dark: adValue('color', 'dark'), yellow: adValue('color', 'yellow') }
/** The grey for venues, dates and other details, as on the Event Guide. */
export const META_GREY = adValue('color', 'meta')
/** Boxes dragged before revision 2 were trial values Shaun sent over; they are now the defaults, so they are dropped once. */
export const BACKGROUNDS_REVISION = 2
export const seriesName = (s: Series) => s === 'picks' ? 'Event Guide Picks' : 'What’s New in Dublin'
export const newId = () => crypto.randomUUID()
export const crop = (): Crop => ({ x: 50, y: 50, zoom: 1 })
export const blankStory = (): Story => ({ id: newId(), title: '', body: '', handle: '', date: '', time: '', venue: '', photo: '', coverEligible: true, crop: crop(), imageHeight: null })
export const coverTitle = (s: Series) => s === 'picks' ? 'Event\nGuide\nPicks' : 'What’s\nNew in\nDublin'
export const clone = <T>(value: T): T => structuredClone(value)
export const designUnlocked = () => typeof location !== 'undefined' && new URLSearchParams(location.search).has('unlocked')
/** Resolve the current house restrictions at render time. Hidden choices remain saved for later. */
export function coverLook(issue: Issue, open = false) {
  const { cover, series } = issue
  return {
    count: open ? cover.layout : 2,
    logoPosition: open ? cover.logoPosition : 'right' as const,
    markColour: (open && cover.markColour !== 'series') ? cover.markColour : series === 'picks' ? 'yellow' : 'white',
    divider: open ? cover.divider : 'dark' as const,
    showSubtitle: series === 'new' || open,
    subtitlePosition: open ? cover.subtitlePosition : 'bottom' as const,
  }
}
/** Every inside picture is the house height, so the words keep to the room it leaves (Shaun, 2 Oct:
 *  pages should stay scannable). A story's own height is kept for `?unlocked`, as other locked choices are. */
export const pictureHeight = (story: Story, brand: Brand, open = designUnlocked()) => open && story.imageHeight != null ? story.imageHeight : brand.imageHeight
/** One or two handles, typed with spaces, commas or "&" between them; each gets its @. */
export const handlesOf = (typed: string) => typed.split(/[\s,&+]+/).filter(Boolean).map(handle => handle.startsWith('@') ? handle : '@' + handle)

// Each page holds as much as a real one does (Shaun's example, 2 Oct: ~540 characters in one
// block fills a page). Under a two-line headline, with two paragraphs, it's about 400.
const SAMPLE_STORIES = [
  { title: 'Ruby Sessions', body: 'You’re in Dublin and looking for a fun night out? The Ruby Sessions at Doyle’s brings together live acoustic music, a candlelit atmosphere and different artists performing every Tuesday. You can discover new names, catch a few familiar faces and enjoy music up close in a relaxed and friendly room. The night is all about listening, so it’s a welcome change from a loud bar. Whether you come with friends or on your own, the Ruby Sessions offers a warm and memorable way to spend your Tuesday evening in Dublin.', handle: '@therubysessions', date: '6 Oct', time: '8:30pm', venue: 'Doyle’s Bar', photo: '/photos/pub.jpg' },
  { title: 'A little room for creativity', body: 'Looking for something a little different this week? This relaxed painting evening invites you to slow down, pick up a brush and make a little room for creativity.\n\nYou can paint along with a friendly guide, try out new colours and techniques, and take home something you made yourself at the end of the night. All levels are welcome, so there’s no pressure at all to create a masterpiece. Bring a friend, grab a drink and see where the evening takes you – you might surprise yourself.', handle: '@alternativedublin', date: '8 Oct', time: '6:30pm', venue: 'Dublin', photo: '/photos/art.jpg' },
  { title: 'A night at the cinema', body: 'Big stories belong on a big screen. Make a night of it at the Lighthouse in Smithfield with a film, a drink and a proper catch-up with friends after the credits roll. Choose something you’ve been meaning to see for ages, or take a chance on a title you know very little about. Arrive a little early to grab a drink, find a good seat and enjoy the build-up before the lights go down. Whether you’re a regular or haven’t been in years, a night at the cinema is a simple and memorable way to spend your evening in Dublin.', handle: '@lighthousecinema', date: '9 Oct', time: '7pm', venue: 'Smithfield', photo: '/photos/cinema.jpg' },
  { title: 'IFI Horrorthon 2026 programme announced', body: 'The IFI Horrorthon returns with contemporary horror from around the world, classic folk horror, late-night double bills and the annual Horror Table Quiz.\n\nThe festival will also feature a cine-concert of The Cat and the Canary, accompanied live by musician Stephen Horne. Popular screenings tend to sell out quickly, so it’s well worth booking your tickets for the ones you want as early as you can. Whether you’re a lifelong horror fan or just curious, it’s the perfect excuse to see something unexpected on the big screen.', handle: '@horrorthon_fest', date: '22–26 Oct', time: '', venue: 'IFI', photo: '/photos/music.jpg' },
]
/** Sample text the tool shipped before: a sample guide's story still holding it was never rewritten, so it takes today's. */
const OLD_SAMPLE_TEXT = [
  'Looking for something a little different this week? This relaxed painting evening invites you to slow down, pick up a brush and make a little room for creativity.\n\nYou can paint along with a friendly guide, try out new colours and techniques, and take home something you made yourself at the end of the night. All levels are welcome, so there’s no pressure at all to create a masterpiece.',
  'The IFI Horrorthon returns with contemporary horror from around the world, classic folk horror, late-night double bills and the annual Horror Table Quiz.\n\nThe festival will also feature a cine-concert of The Cat and the Canary, accompanied live by musician Stephen Horne. Popular screenings tend to sell out quickly, so it’s well worth booking your tickets for the ones you want as early as you can.',
  'You’re in Dublin and looking for a fun night out? The Ruby Sessions at Doyle’s brings together live acoustic music, a candlelit atmosphere and different artists performing every Tuesday.\n\nGrab your friends, come along and enjoy a night of live music.',
  'An evening to slow down, pick up a brush and try something new.\n\nBring a friend, settle into the studio and make something of your own. All levels are welcome.',
  'Big stories belong on a big screen. Make a night of it with a film, a drink and a proper catch-up.\n\nSwap in your own event details here, or import this week’s picks to build the whole guide at once.',
  'The IFI Horrorthon returns with contemporary horror from around the world, classic folk horror, late-night double bills and the annual Horror Table Quiz.\n\nThe festival will also feature a cine-concert of The Cat and the Canary, accompanied live by musician Stephen Horne.',
  'Looking for something a little different this week? This relaxed painting evening invites you to slow down, pick up a brush and make a little room for creativity. All levels are welcome, so there’s no pressure to create a masterpiece.\n\nYou can paint along with a friendly guide, try out new colours and techniques, and take home something you made yourself at the end of the night. Whether you come with friends or want to meet new people, it’s a fun, creative and refreshingly screen-free way to spend an evening in Dublin.',
  'The IFI Horrorthon returns with contemporary horror from around the world, classic folk horror, late-night double bills and the annual Horror Table Quiz. The festival will also feature a cine-concert of The Cat and the Canary, accompanied live by musician Stephen Horne.\n\nWhether you’re a lifelong horror fan or just curious, it’s a great chance to see something unexpected on the big screen with a crowd that really loves it. Popular screenings tend to sell out quickly, so it’s worth booking your tickets as early as you can.',
]
/** How the generated fuller-copy text began (both versions), whatever its length. */
const OLD_FILL_OPENINGS = ['Make a little room in your week for **live music**', 'You’re in Dublin and looking for a good night out? This one brings together **live acoustic music**', 'An evening to slow down, **pick up a brush**', '**Big stories belong on a big screen.** Make time for a film', 'A good horror programme brings together **new discoveries**']
const isOldSampleText = (body: string) => OLD_SAMPLE_TEXT.includes(body) || OLD_FILL_OPENINGS.some(opening => body.startsWith(opening))

export function makeIssue(series: Series, sample = false): Issue {
  const stories = sample ? SAMPLE_STORIES.map(s => ({ ...blankStory(), ...s, coverEligible: s.photo !== '/photos/art.jpg' })) : [blankStory()]
  const coverStories = sample ? [stories[2],stories[3],stories[0],stories[2]] : stories
  return { id: newId(), name: sample ? 'October picks · try me' : 'Untitled guide', series, sample, updated: new Date().toISOString(), stories, cover: { title: coverTitle(series), subtitle: 'New openings, good stories\nand more…', date: '5 OCT – 11 OCT', slots: Array.from({ length: 4 }, (_, i) => coverStories[i % coverStories.length].id), photos: Array(4).fill(''), backgrounds: { picks:null, new:null }, backgroundsRevision: BACKGROUNDS_REVISION, crops: Array.from({ length: 4 }, crop), position: 50, scrim: 30, layout: 2, orientation: 'vertical', logoPosition: 'right', markColour: 'series', divider: 'dark', subtitlePosition: 'bottom' } }
}

/** A cover upload belongs to its photo slot, never to an inside story. */
export function coverPhoto(issue: Issue, index: number): string {
  return issue.cover.photos[index] || issue.stories.find(s => s.id === issue.cover.slots[index] && s.coverEligible)?.photo || ''
}

export function switchSeries(issue: Issue, next: Series) {
  const wasDefault = issue.cover.title === coverTitle(issue.series)
  issue.series = next
  if (wasDefault) issue.cover.title = coverTitle(next)
}

const string = (value: unknown, limit = 20000) => typeof value === 'string' ? value.slice(0, limit) : ''
const bounded = (n: unknown, low: number, high: number, fallback: number) => typeof n === 'number' && Number.isFinite(n) ? Math.min(high, Math.max(low, n)) : fallback
const record = (o: unknown): Record<string, any> => o && typeof o === 'object' && !Array.isArray(o) ? o as Record<string, any> : {}
const safeCrop = (c: unknown): Crop => { const o = record(c); return { x: bounded(o.x, 0, 100, 50), y: bounded(o.y, 0, 100, 50), zoom: bounded(o.zoom, 1, 3, 1) } }
const safePhoto = (p: unknown) => typeof p === 'string' && (/^data:image\/(jpeg|png|webp);base64,[a-zA-Z0-9+/=]+$/.test(p) || /^\/photos\/(pub|art|cinema|music)\.jpg$/.test(p)) ? p : ''
export function sanitizeBrand(value: unknown): Brand {
  const b = record(value)
  // Adopt the approved typography once for the first prototype's saved drafts.
  // Words, photographs, crops, margins and every subsequent design adjustment survive.
  const type = [2, 3, 4, 5, 6, 7, 8].includes(b.revision) ? b : BASE_BRAND
  // Revision 4 took the shared palette and picture height once, revision 5 the Regular body; later House style edits are kept.
  // Revision 6 took the shared title weight, 168; revision 7 the shared tag weight, ExtraBold 166, for the date strip;
  // revision 8 the smaller story title and picture (64 and 500), so the stories the team writes fit.
  const shared = b.revision >= 4 ? b : BASE_BRAND, body = b.revision >= 5 ? b : BASE_BRAND, titles = b.revision >= 6 ? b : BASE_BRAND, tags = b.revision >= 7 ? b : BASE_BRAND, fit = b.revision >= 8 ? b : BASE_BRAND
  const color = (v: unknown, fallback: string) => typeof v === 'string' && /^#[\da-f]{6}$/i.test(v) ? v : fallback
  return { revision: 8, bodySize: bounded(type.bodySize, 34, 44, BASE_BRAND.bodySize), bodyWeight: body.bodyWeight === 500 ? 500 : 400, titleSize: bounded(fit.titleSize, 45, 90, BASE_BRAND.titleSize), titleWeight: bounded(titles.titleWeight, 141, 188, BASE_BRAND.titleWeight), dateWeight: bounded(tags.dateWeight, 141, 188, BASE_BRAND.dateWeight), lineHeight: bounded(type.lineHeight, 1.15, 1.4, BASE_BRAND.lineHeight), margin: bounded(b.margin, 44, 76, BASE_BRAND.margin), imageHeight: bounded(fit.imageHeight, 360, 600, BASE_BRAND.imageHeight), coverSize: bounded(type.coverSize, 150, 220, BASE_BRAND.coverSize), coverTracking: bounded(type.coverTracking, -6, 0, BASE_BRAND.coverTracking), coverLineHeight: bounded(type.coverLineHeight, .75, 1, BASE_BRAND.coverLineHeight), subtitleSize: bounded(type.subtitleSize, 38, 54, BASE_BRAND.subtitleSize), lightBody: b.revision === 2 ? BASE_BRAND.lightBody : color(type.lightBody, BASE_BRAND.lightBody), darkBody: color(shared.darkBody, BASE_BRAND.darkBody), light: color(b.light, BASE_BRAND.light), dark: color(shared.dark, BASE_BRAND.dark), yellow: color(shared.yellow, BASE_BRAND.yellow) }
}
// Earlier backups embedded the demo poster. Recognise its exact bytes, without excluding replacement photography.
const isSamplePoster = (photo: string) => photo === '/photos/art.jpg' || (photo.length === 299695 && crc32(new TextEncoder().encode(photo)) === 2975244171)
const sanitizeStory = (s: Record<string, any>, id: string): Story => ({ id, title: string(s.title, 500), body: string(s.body), handle: string(s.handle, 200), date: string(s.date, 100), time: string(s.time, 100), venue: string(s.venue, 200), photo: safePhoto(s.photo), coverEligible: s.coverEligible !== false && !isSamplePoster(safePhoto(s.photo)), crop: safeCrop(s.crop), imageHeight: s.imageHeight == null ? null : bounded(s.imageHeight, 280, 620, 530) })
export function sanitizeIssue(value: unknown): Issue {
  const o = record(value)
  if (!Array.isArray(o.stories) || !o.stories.length || o.stories.length > 40) throw new Error('A guide must contain between 1 and 40 stories.')
  const seen = new Set<string>()
  const stories = o.stories.map((entry: unknown) => {
    const s = record(entry)
    let id = string(s.id, 100) || newId()
    if (seen.has(id)) id = newId()
    seen.add(id)
    // A sample guide's story still holding older sample text takes today's, at the house picture height.
    const today = o.sample === true && isOldSampleText(string(s.body)) ? SAMPLE_STORIES.find(sample => sample.title === s.title) : undefined
    if (today) return { ...sanitizeStory(s, id), body: today.body, imageHeight: null }
    return sanitizeStory(s, id)
  })
  const c = record(o.cover)
  const boxes: Record<string, unknown> = c.backgroundsRevision === BACKGROUNDS_REVISION ? record(c.backgrounds) : {}
  const coverStories = stories.filter(s => s.coverEligible)
  const series: Series = o.series === 'new' ? 'new' : 'picks'
  return { id: string(o.id, 100) || newId(), name: string(o.name, 150) || 'Untitled guide', series, stories, sample: o.sample === true, updated: string(o.updated, 100) || new Date().toISOString(), cover: { title: string(c.title, 250) || coverTitle(series), subtitle: string(c.subtitle, 300), date: string(c.date, 100), slots: Array.from({ length: 4 }, (_, i) => coverStories.some(s => s.id === c.slots?.[i]) ? c.slots[i] : (coverStories[i % coverStories.length]?.id || '')), photos: Array.from({ length: 4 }, (_, i) => safePhoto(c.photos?.[i])), backgrounds: { picks:readBounds(boxes.picks), new:readBounds(boxes.new) }, backgroundsRevision: BACKGROUNDS_REVISION, crops: Array.from({ length: 4 }, (_, i) => safeCrop(c.crops?.[i])), position: bounded(c.position, 30, 70, 50), scrim: bounded(c.scrim, 0, 80, 30), layout: c.layout === 4 ? 4 : 2, orientation: c.orientation === 'horizontal' ? 'horizontal' : 'vertical', logoPosition: ['left','right','off'].includes(c.logoPosition) ? c.logoPosition : 'right', markColour: ['series','yellow','white','dark'].includes(c.markColour) ? c.markColour : 'series', divider: ['dark','light','yellow'].includes(c.divider) ? c.divider : 'dark', subtitlePosition: c.subtitlePosition === 'tape' ? 'tape' : 'bottom' } }
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** A Sheet time as footers write it: 8:00 PM → 8pm, 7:30 PM → 7:30pm, 20:00 → 8pm (a time cell's 8:00:00 PM too). Anything else stays as typed; TBC is left out. */
export function footerTime(value: string) {
  const time = value.trim(), parts = /^(\d{1,2})(?:[:.](\d{2}))?(?::\d{2})?\s*(am|pm)?$/i.exec(time)
  if (!parts) return /^tbc$/i.test(time) ? '' : time
  let hours = Number(parts[1]), meridiem = parts[3]?.toLowerCase()
  if (hours > 23 || (meridiem && (hours < 1 || hours > 12))) return time
  if (!meridiem) { meridiem = hours >= 12 ? 'pm' : 'am'; hours = hours % 12 || 12 }
  return `${hours}${parts[2] && parts[2] !== '00' ? `:${parts[2]}` : ''}${meridiem}`
}
/** A Sheet date as footers write it: a date cell (Date(2026,9,9), as Google sends it) or 2026-10-09 → 9 Oct. Anything typed stays as typed. */
export function footerDate(value: string) {
  const cell = /^Date\((\d{4}),(\d{1,2}),(\d{1,2})/.exec(value.trim()), iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (cell) return `${Number(cell[3])} ${MONTH_NAMES[Number(cell[2])]}`
  if (iso) return `${Number(iso[3])} ${MONTH_NAMES[Number(iso[2]) - 1]}`
  return value.trim()
}
/** A tick in a Sheet column: TRUE, or yes, y, 1, x, ✓. */
const ticked = (value: unknown) => /^(true|yes|y|1|x|✓|✔)$/i.test(String(value ?? '').trim())
/** A Sheet or CSV: its first row the column names. `typed` names columns Google holds as dates or times (see sheet.ts). */
type Table = { headers: string[]; rows: string[][]; typed?: string[] }
const columnKey = (header: string) => header.toLowerCase().replace(/[^a-z]/g, '')
/**
 * The events Sheet, the event guide's, read the way the event guide reads it (weekday rows, approval,
 * dates). A Picks guide takes the approved rows with TOP PICKS ticked: title, handle, date, time and venue
 * come from the row, and the text from a Blurb (or Description) column when the Sheet has one. Null for
 * any other table.
 */
function eventSheetStories(table: Table, series: Series) {
  const columns = mapHeaders(table.headers)
  if (columns.topPick < 0 && columns.whatsNew < 0) return null
  if (series === 'new' && columns.whatsNew < 0) throw new Error('That’s the events Sheet, which has no What’s New column. Use the What’s New stories’ own Sheet, or paste them from your doc.')
  const { events } = normalizeRows(table)
  const picked = events.filter((event: { topPick: boolean; whatsNew: string }) => series === 'picks' ? event.topPick : ticked(event.whatsNew))
  if (!picked.length) throw new Error(series === 'picks' ? 'No approved rows have TOP PICKS ticked. Tick the week’s picks in the Sheet, or paste the stories from your doc.' : 'No approved rows are ticked What’s New.')
  const keys = table.headers.map(columnKey)
  // BLURB is the Instagram text; the Sheet's DESCRIPTION is the website's one or two sentences, so it is only a start.
  const blurb = ['blurb', 'text', 'body', 'copy', 'story', 'description'].map(name => keys.indexOf(name)).find(index => index >= 0) ?? -1
  const stories: Story[] = picked.map((event: { title: string; instagram: string; date: Date; time: string; venue: string; sourceRow: number }) => ({ ...blankStory(), title: event.title, body: blurb >= 0 ? string(table.rows[event.sourceRow - 2]?.[blurb]).trim() : '', handle: event.instagram, date: `${event.date.getDate()} ${MONTH_NAMES[event.date.getMonth()]}`, time: footerTime(event.time), venue: event.venue }))
  const warnings = [`${picked.length} of the Sheet’s ${events.length} approved events ${picked.length === 1 ? 'is' : 'are'} ticked ${series === 'picks' ? 'TOP PICKS' : 'What’s New'}.`]
  if (blurb < 0) warnings.push('The Sheet has no Blurb column, so each story’s text is written here.')
  return { stories, warnings, textless: blurb < 0 }
}
/**
 * A stories Sheet (or CSV): one story to a row, under Title, Text, Instagram, Date, Time and Venue, in any
 * order (or the other names below). Dates and times come out as footers write them.
 */
function tableStories(table: Table, series: Series) {
  const events = eventSheetStories(table, series)
  if (events) return events
  const keys = table.headers.map(columnKey)
  const column = (names: string[]) => { for (const name of names) { const index = keys.indexOf(name); if (index >= 0) return index } return -1 }
  const title = column(['title', 'headline', 'name', 'eventname']), body = column(['text', 'body', 'blurb', 'description', 'copy', 'story', 'comments'])
  const handle = column(['instagram', 'handle', 'instagramlink', 'instagramname', 'ig']), date = column(['date', 'day']), time = column(['time', 'starttime']), venue = column(['venue', 'location'])
  if (title < 0) throw new Error('No Title column. The first row names the columns: Title, Text, Instagram, Date, Time, Venue.')
  const cell = (row: string[], index: number) => index < 0 ? '' : string(row[index]).trim()
  const rows = table.rows.filter(row => row.some(value => String(value ?? '').trim()))
  const stories: Story[] = rows.map(row => ({ ...blankStory(), title: cell(row, title), body: cell(row, body), handle: cell(row, handle), date: footerDate(cell(row, date)), time: footerTime(cell(row, time)), venue: cell(row, venue) }))
  // Google drops a cell typed as text (22–26 Oct) from a column it holds as dates or times.
  const dropped = [[date, 'Date'], [time, 'Time']].filter(([index]) => typeof index === 'number' && index >= 0 && table.typed?.includes(table.headers[index as number]) && rows.some(row => !cell(row, index as number)))
  const warnings = dropped.map(([, name]) => `Some stories have no ${name}. If the Sheet shows one, set its ${name} column to Plain text (Format → Number → Plain text) and load it again.`)
  return { stories, warnings, textless: false }
}

/**
 * The team's weekly What's New doc (WK41, Oct 2026): a heading per story marked ✅ done, 🟠 waiting for
 * review, 🔴 not started or ❌ deleted, then Written by:, Brief:, Link:, Instagram:, Text: and Newsletter
 * Text: lines, under a traffic-light key. Only the ✅ stories' Text goes on the slides.
 */
const STATUS_LINE = /^([✅🟢☑✔🟠🟡🔴❌])️?\s*(.*)$/u
const DONE = new Set(['✅', '🟢', '☑', '✔'])
/** Notes for the team, not the slide: these lines and the ones under them stay out of the story. */
const NOTE_LABEL = /^(?:newsletter(?: text)?|written by|brief|link)\s*:/i
const statusDoc = (text: string) => text.split('\n').some(line => STATUS_LINE.test(line.trim())) && /^\s*(?:written by|brief|newsletter(?: text)?)\s*:/im.test(text)

/**
 * Pasted copy split into its stories: at a line of dashes (Google Docs can turn --- into — or –), at a
 * Markdown heading, at a Title: line once the story before it has begun, or in the What's New doc at
 * each status-marked heading.
 */
function docSections(text: string, statuses = false) {
  const sections: string[][] = [[]]
  for (const raw of text.split('\n')) {
    const line = raw.trim(), current = sections[sections.length - 1]
    if (/^(?:-{3,}|[–—][-–—]*)$/.test(line)) { sections.push([]); continue }
    const startsStory = /^#{1,3}\s/.test(line) || /^(?:title|headline)\s*:/i.test(line) || (statuses && STATUS_LINE.test(line))
    if (startsStory && current.some(l => l.trim())) sections.push([raw]); else current.push(raw)
  }
  return sections.map(lines => lines.join('\n')).filter(section => section.trim())
}

export function parseImport(input: string | Table, series: Series = 'picks'): { stories: Story[]; warnings: string[] } {
  const warnings: string[] = []
  let stories: Story[] = [], textless = false
  const text = typeof input === 'string' ? input.trim().replace(/\r\n?/g, '\n') : ''
  if (typeof input === 'string' && !text) throw new Error('Paste some stories first.')
  const firstLine = text.split('\n')[0]
  const csv = firstLine.includes(',') ? rowsFromCsv(text) : null
  const table: Table | null = typeof input !== 'string' ? input : csv && (/(?:title|name|headline)/i.test(firstLine) || mapHeaders(csv.headers).topPick >= 0) ? csv : null
  if (table) {
    const read = tableStories(table, series)
    stories = read.stories; textless = read.textless; warnings.push(...read.warnings)
  } else {
    const statuses = statusDoc(text)
    const read = docSections(text, statuses).map(section => {
      const s = blankStory()
      const body: string[] = []
      let readingBody = false, inNote = false, labelled = false, status = ''
      for (const raw of section.trim().split('\n')) {
        const line = raw.trim()
        const field = /^(title|headline|name|body|text|description|handle|instagram|date|time|venue|location)\s*:\s*(.*)$/i.exec(line)
        if (field) {
          const key = ({ headline:'title', name:'title', text:'body', description:'body', instagram:'handle', location:'venue' } as Record<string,string>)[field[1].toLowerCase()] ?? field[1].toLowerCase()
          readingBody = key === 'body'; inNote = false; labelled = true
          if (key === 'body') body.push(field[2]); else (s as any)[key] = field[2]
        } else if (statuses && NOTE_LABEL.test(line)) { readingBody = false; inNote = labelled = true }
        else if (!s.title && line) {
          const marked = statuses ? STATUS_LINE.exec(line) : null
          if (marked) status = marked[1]
          s.title = marked ? marked[2] : line.replace(/^#{1,3}\s+/, ''); readingBody = true
        }
        else if (inNote) continue
        else if (/^@[\w.]+$/.test(line) && !s.handle) { s.handle = line; readingBody = false }
        // Once the text has started, an empty line between paragraphs stays a paragraph break.
        else if (readingBody || line) { body.push(raw); if (line) readingBody = true }
      }
      s.body = body.join('\n').trim()
      return { s, status, labelled }
    })
    // In the What's New doc the key and the notes above the first story carry no labels, and a story
    // waits for the next import until it's ✅.
    const marked = statuses ? read.filter(r => r.status && r.labelled) : read
    const waiting = statuses ? marked.filter(r => !DONE.has(r.status)) : []
    stories = marked.filter(r => !waiting.includes(r)).map(r => r.s)
    if (waiting.length) warnings.push(`Left out ${waiting.length} ${waiting.length === 1 ? 'story' : 'stories'} not marked ✅: ${waiting.map(r => r.s.title).join('; ')}.`)
    if (statuses && marked.length && !stories.length) throw new Error('None of the doc’s stories is marked ✅ yet.')
  }
  if (stories.length > 40) throw new Error('Import up to 40 stories at a time.')
  if (!stories.length) throw new Error('No stories found. Use a title and paragraph, with --- between stories.')
  stories.forEach((s, i) => {
    if (!s.title) warnings.push(`Story ${i + 1} needs a title.`)
    if (!s.body && !textless) warnings.push(`Story ${i + 1} needs body text.`)
    // Instagram links become handles; a row may name two.
    s.handle = s.handle.split(/[\s,]+/).filter(Boolean).map(part => { if (!/^https?:\/\//.test(part)) return part; try { return '@' + new URL(part).pathname.split('/').filter(Boolean)[0] } catch { return part /* Kept for review. */ } }).join(' ')
    if (/^[\w-]+(?:\.[\w-]+)*\.(?:com|ie|net|org|eu|io|co\.uk)$/i.test(s.handle)) warnings.push(`Story ${i + 1}’s Instagram line, ${s.handle}, looks like a website, not a handle.`)
  })
  warnings.push('Add a photo to each imported story before exporting.')
  return { stories, warnings }
}

let db: Promise<IDBDatabase> | undefined
function database() {
  return db ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('alternative-dublin-guide-studio', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('library')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
export async function readLibrary(): Promise<Library | null> {
  const databaseHandle = await database()
  return new Promise((resolve, reject) => {
    const r = databaseHandle.transaction('library').objectStore('library').get('current')
    r.onsuccess = () => {
      try {
        if (!r.result) return resolve(null)
        const value = r.result as Library
        if (value.version !== 1 || !Array.isArray(value.issues)) throw new Error('This saved library needs a newer version of Guide Studio.')
        resolve({ version: 1, activeId: value.activeId, brand: sanitizeBrand(value.brand), issues: value.issues.map(sanitizeIssue) })
      } catch (e) { reject(e) }
    }
    r.onerror = () => reject(r.error)
  })
}
export async function saveLibrary(library: Library) {
  const databaseHandle = await database()
  return new Promise<void>((resolve, reject) => {
    const tx = databaseHandle.transaction('library', 'readwrite')
    tx.objectStore('library').put(library, 'current')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error || new Error('Saving was interrupted.'))
  })
}
