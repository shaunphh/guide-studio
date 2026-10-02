import { buildShape } from './tape/geometry'
import { defaults } from './tape/settings'
import { photoRect } from './tape/photo'
import type { CoverBounds } from './cover-bounds'
import { gxCovers, nearestStatic, stemOf } from './barlow'
import { META_GREY, coverLook, coverPhoto, designUnlocked, handlesOf, pictureHeight, type Brand, type Crop, type Issue, type Story } from './model'

export const WIDTH = 1080, HEIGHT = 1350
/** Story text must end above this line, clear of the footer. */
const BODY_BOTTOM = HEIGHT - 146
/** Tape Type's cover furniture (furniture.ts): marks and lettering keep 80px from every edge; the logo is 210 wide, the arrow 100. */
const SAFE = 80, LOGO_WIDTH = 210, ARROW_WIDTH = 100
/** The AD footer style, shared with the Event Guide: Bold, the names in ink, dates and details in the meta grey. */
const FOOTER = { size: 31, weight: 700, step: 35 }
/** Tape Type's inside-page label (inside.ts): ExtraBold at the body size, on tape with a clean cut of its own. */
const LABEL = { size: 38, weight: 800 }
/** Tape Type's eyebrow tag (geometry.ts), in ems of the tag's size: the cover date strip is one. */
const TAG_PADDING = { x: .45, top: .4, bottom: .22 }
const images = new Map<string, Promise<HTMLImageElement>>()
const loaded = new Map<string, HTMLImageElement>()
/** A file from public/ wherever the app is served from: the root locally, /guide-studio/ on GitHub Pages. Pages keep root paths such as /photos/pub.jpg. */
export const asset = (path: string) => path.startsWith('/') && !path.startsWith('//') ? import.meta.env.BASE_URL + path.slice(1) : path
/** A photo that has finished loading, for work that can't wait (a drag needs its size). */
export const loadedImage = (url: string) => loaded.get(url)
export function loadImage(url: string) {
  let promise = images.get(url)
  if (!promise) {
    promise = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => { loaded.set(url, img); resolve(img) }
      img.onerror = () => { images.delete(url); reject(new Error('A photo could not load. Replace it and try again.')) }
      img.src = asset(url)
    })
    images.set(url, promise)
  }
  return promise
}
export async function loadFonts() {
  const faces = [...[400,500,600,700,800,900].map(w => `${w} 38px Barlow`), ...[400,500,700].map(w => `italic ${w} 38px Barlow`), ...[71,96,141,166,178,188].map(w => `${w} 54px "Barlow GX Normal"`)]
  await Promise.all(faces.map(face => document.fonts.load(face)))
  if (!faces.every(face => document.fonts.check(face))) throw new Error('The brand fonts could not load. Reload before exporting.')
}
/** Upright text at a usual weight (400–900), from the variable font; see barlow.ts for the exceptions. */
function font(ctx: CanvasRenderingContext2D, size: number, weight = 400, italic = false, text = '') {
  ctx.font = italic || !gxCovers(text) ? `${italic ? 'italic ' : ''}${weight} ${size}px Barlow` : `${stemOf(weight)} ${size}px "Barlow GX Normal"`
  ctx.textBaseline = 'alphabetic'
}
/** Text at a weight on the variable font's own scale, such as 178. */
function variableFont(ctx: CanvasRenderingContext2D, size: number, weight: number, text = '') {
  // This font has Event-guide's Normal width baked in; title/date tracking is always zero.
  ctx.font = gxCovers(text) ? `${weight} ${size}px "Barlow GX Normal"` : `${nearestStatic(weight)} ${size}px Barlow`; ctx.textBaseline = 'alphabetic'
  if (typeof (ctx as { letterSpacing?: unknown }).letterSpacing === 'string') ctx.letterSpacing = '0px'
}
export const trackedWidth = (ctx: CanvasRenderingContext2D, text: string, tracking: number) => ctx.measureText(text).width + Math.max(0, Array.from(text).length - 1) * tracking
/** Native letter spacing preserves kerning. Prefix measurements provide the older-browser fallback. */
function trackedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, tracking: number) {
  if (typeof (ctx as { letterSpacing?: unknown }).letterSpacing === 'string') {
    const tracked = ctx as CanvasRenderingContext2D & { letterSpacing: string }
    tracked.letterSpacing = `${tracking}px`; tracked.fillText(text, x, y); tracked.letterSpacing = '0px'
  } else {
    let prefix = '', count = 0
    for (const char of text) { ctx.fillText(char, x + ctx.measureText(prefix).width + count * tracking, y); prefix += char; count++ }
  }
}
export function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    if (!paragraph.trim()) { lines.push(''); continue }
    let line = ''
    for (const word of paragraph.trim().split(/\s+/)) {
      const next = line ? `${line} ${word}` : word
      if (line && ctx.measureText(next).width > width) { lines.push(line); line = '' }
      if (ctx.measureText(word).width > width) {
        for (const character of word) {
          if (line && ctx.measureText(line + character).width > width) { lines.push(line); line = '' }
          line += character
        }
      } else line = line ? `${line} ${word}` : word
    }
    if (line) lines.push(line)
  }
  return lines
}
type Run = { text: string; weight: number; italic: boolean }
function runs(text: string, bodyWeight: number): Run[] {
  let weight = bodyWeight, italic = false
  return text.split(/(\*\*|_)/).filter(Boolean).flatMap(part => {
    if (part === '**') { weight = weight === bodyWeight ? 700 : bodyWeight; return [] }
    if (part === '_') { italic = !italic; return [] }
    return [{ text: part, weight, italic }]
  })
}
function drawBody(ctx: CanvasRenderingContext2D, text: string, x: number, top: number, width: number, brand: Brand, fill: string, emphasis: string, paint = true) {
  let y = top + brand.bodySize * .8, cursor = x
  const line = brand.bodySize * brand.lineHeight
  for (const paragraph of text.split('\n')) {
    if (!paragraph.trim()) { y += line * .5; continue }
    for (const run of runs(paragraph, brand.bodyWeight)) {
      font(ctx, brand.bodySize, run.weight, run.italic, run.text)
      ctx.fillStyle = run.weight === 700 ? emphasis : fill
      for (const token of run.text.split(/(\s+)/).filter(Boolean)) {
        const isSpace = /^\s+$/.test(token)
        const w = ctx.measureText(token).width
        if (cursor > x && cursor + w > x + width && !isSpace) { cursor = x; y += line }
        if (isSpace && cursor === x) continue
        if (w > width) {
          for (const char of token) {
            const cw = ctx.measureText(char).width
            if (cursor + cw > x + width) { cursor = x; y += line }
            if(paint)ctx.fillText(char, cursor, y); cursor += cw
          }
        } else { if (!isSpace || cursor + w <= x + width) { if(paint)ctx.fillText(token, cursor, y); cursor += w } }
      }
    }
    cursor = x; y += line
  }
  return y - line + brand.bodySize * .25
}
function photo(ctx: CanvasRenderingContext2D, img: HTMLImageElement | undefined, crop: Crop, x: number, y: number, w: number, h: number, scrim = 0) {
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip()
  if (img) {
    const r = photoRect(img.naturalWidth, img.naturalHeight, crop, { width: w, height: h })
    ctx.drawImage(img, x + r.x, y + r.y, r.width, r.height)
  } else {
    ctx.fillStyle = '#d3d3cd'; ctx.fillRect(x, y, w, h)
    ctx.strokeStyle = '#bbbcb4'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x+w,y+h); ctx.moveTo(x+w,y); ctx.lineTo(x,y+h); ctx.stroke()
    ctx.fillStyle = '#63645c'; font(ctx, 26, 600, false, 'ADD A PHOTO'); ctx.textAlign = 'center'; ctx.fillText('ADD A PHOTO', x + w/2, y + h/2); ctx.textAlign = 'left'
  }
  if (scrim) { ctx.fillStyle = `rgba(0,0,0,${scrim/100})`; ctx.fillRect(x,y,w,h) }
  ctx.restore()
}

/** `headline` is the lettering's own box (before any custom background), for grabbing it on the canvas. */
export type RenderResult = { errors: string[]; background?: CoverBounds; headline?: CoverBounds }
export async function renderPage(canvas: HTMLCanvasElement, issue: Issue, page: number, brand: Brand, scale = 1): Promise<RenderResult> {
  const look = coverLook(issue, designUnlocked())
  const needed = page === 0 ? Array.from({length:look.count},(_,i)=>coverPhoto(issue,i)) : [issue.stories[page - 1]?.photo || '']
  const assets: Record<string, HTMLImageElement> = {}
  const errors: string[] = []
  await Promise.all([...new Set([...needed.filter(Boolean), ...(page === 0 ? [`/logo-${look.logoPosition==='left'?'left':'right'}.svg`,'/swipe-arrow.svg'] : [])])].map(async url => {
    try { assets[url] = await loadImage(url) } catch { errors.push('A photo or brand mark could not load.') }
  }))
  const out = document.createElement('canvas'); out.width = WIDTH * scale; out.height = HEIGHT * scale
  const ctx = out.getContext('2d')!
  ctx.scale(scale, scale); ctx.textAlign = 'left'
  ctx.fillStyle = issue.series === 'picks' ? brand.light : brand.dark; ctx.fillRect(0,0,WIDTH,HEIGHT)
  let background: CoverBounds | undefined, headline: CoverBounds | undefined
  if (page === 0) ({ background, headline } = drawCover(ctx, issue, brand, assets, errors))
  else {
    const s = issue.stories[page - 1]
    if (!s) throw new Error('This page no longer exists.')
    drawStory(ctx, s, page, issue, brand, assets, errors)
  }
  canvas.width = out.width; canvas.height = out.height
  canvas.getContext('2d')!.drawImage(out,0,0)
  return { errors: [...new Set(errors)], background, headline }
}

function drawStory(ctx: CanvasRenderingContext2D, s: Story, number: number, issue: Issue, brand: Brand, assets: Record<string, HTMLImageElement>, errors: string[]) {
  const dark = issue.series === 'new', titleInk = dark ? brand.light : brand.dark, bodyInk = dark ? brand.darkBody : brand.lightBody
  const h = pictureHeight(s, brand), m = brand.margin, w = WIDTH - 2*m
  photo(ctx, assets[s.photo], s.crop, 0, 0, WIDTH, h)
  if (!s.photo) errors.push('Add a photo to this story.')
  if (!s.title.trim()) errors.push('Add a title to this story.')
  if (!s.body.trim()) errors.push('Add body text to this story.')
  drawNumber(ctx, String(number).padStart(2, '0'), m, h, brand)
  variableFont(ctx, brand.titleSize, brand.titleWeight, s.title.toUpperCase())
  const titleLines = wrap(ctx, s.title.toUpperCase(), w)
  ctx.fillStyle = titleInk
  let y = h + 78
  for (const l of titleLines) { ctx.fillText(l, m, y + brand.titleSize * .72); y += brand.titleSize * 1.02 }
  if (titleLines.length > 3) errors.push('The headline is longer than three lines. Shorten it or adjust the house title size.')
  y += 30
  ctx.save(); ctx.beginPath(); ctx.rect(m, y, w, Math.max(0, BODY_BOTTOM - y)); ctx.clip()
  const bottom = drawBody(ctx, s.body, m, y, w, brand, bodyInk, titleInk)
  ctx.restore()
  if (bottom > BODY_BOTTOM) errors.push('The story runs into the footer. Shorten the copy.')
  const footY = HEIGHT - 58
  font(ctx, FOOTER.size, FOOTER.weight, false, s.handle); ctx.fillStyle = titleInk
  const info = issue.series === 'picks' ? [s.date, s.time, s.venue].filter(Boolean).join(' · ') : ''
  const footerWidth = info ? w * .47 : w
  // Two handles stack, one to a line, as two lines of details do on the right.
  const handles = handlesOf(s.handle)
  if (handles.length > 2) errors.push('Keep it to two handles.')
  const handleLines = handles.slice(0, 2).flatMap(handle => wrap(ctx, handle, footerWidth))
  if (handleLines.length > 2) errors.push('The handles are too long for the footer.')
  handleLines.slice(0,2).forEach((l,i) => ctx.fillText(l,m,footY-(handleLines.length > 1 ? FOOTER.step : 0)+i*FOOTER.step))
  if (info) {
    ctx.fillStyle = META_GREY; font(ctx, FOOTER.size, FOOTER.weight, false, info)
    const infoLines = wrap(ctx, info, w * .49)
    if (infoLines.length > 2) errors.push('The event details are too long for the footer.')
    ctx.textAlign = 'right'
    infoLines.slice(0,2).forEach((l,i) => ctx.fillText(l,WIDTH-m,footY-(infoLines.length > 1 ? FOOTER.step : 0)+i*FOOTER.step))
    ctx.textAlign = 'left'
  }
}

/** The page number as Tape Type sets its inside label: lettering on the margin, the tape overhanging it,
 *  here seated across the foot of the picture. */
function drawNumber(ctx: CanvasRenderingContext2D, number: string, x: number, centreY: number, brand: Brand) {
  font(ctx, LABEL.size, LABEL.weight, false, number)
  // Figures have no descenders, so the tape is balanced on the cap height, as Tape Type's label is.
  const ascent = Math.max(ctx.measureText('H').actualBoundingBoxAscent, ctx.measureText(number).actualBoundingBoxAscent)
  const shape = buildShape({ ...defaults, headline: number, style: 'feature', perLine: false, align: 'left', mode: 'clean', fontSize: LABEL.size, hugStrength: 1, rotationVariance: 0 }, [number], [ctx.measureText(number).width], [], { ascent, descent: LABEL.size * .02 })
  const ys = shape.points.map(point => point.y), line = shape.lines[0]
  ctx.save(); ctx.translate(x, centreY - (Math.min(...ys) + Math.max(...ys)) / 2)
  ctx.fillStyle = brand.yellow; ctx.fill(new Path2D(shape.path))
  ctx.fillStyle = brand.dark; ctx.fillText(number, line.x, line.baseline)
  ctx.restore()
}

/**
 * A tag above the cover headline, as Tape Type cuts its eyebrows (2 Oct 2026): capitals on tape with
 * the label's clean cut, fitted to the tag's box, the cut on its free (right) end and its foot flat.
 * `weight` is on the variable font's scale (ExtraBold is 166). Returns the tag's width.
 */
function drawTag(ctx: CanvasRenderingContext2D, text: string, centreX: number, centreY: number, size: number, weight: number, angle: number, fill: string, ink: string, seed: number) {
  variableFont(ctx, size, weight, text)
  const width = ctx.measureText(text).width
  const capHeight = ctx.measureText('H').actualBoundingBoxAscent || size * .7
  const padX = size * TAG_PADDING.x, padTop = size * TAG_PADDING.top
  const box = { width: width + padX * 2, height: capHeight + padTop + size * TAG_PADDING.bottom }
  const cut = buildShape({ ...defaults, headline: text, style: 'feature', perLine: false, align: 'left', mode: 'clean', preferredEdge: 'right', seed: ((seed ^ 0x5bd1e995) >>> 0) || 1, fontSize: size, hugStrength: 1, rotationVariance: 0 }, [text], [width], [], { ascent: capHeight, descent: size * .02 }).points
  const xs = cut.map(point => point.x), ys = cut.map(point => point.y)
  const left = Math.min(...xs), top = Math.min(...ys), right = Math.max(...xs), bottom = Math.max(...ys)
  // How much of the foot is a straight line along the bottom; turned over when the cut took a bottom corner.
  const footOf = (points: { x: number; y: number }[]) => points.reduce((span, point, i) => { const next = points[(i + 1) % points.length]; return Math.abs(point.y - bottom) < .01 && Math.abs(next.y - bottom) < .01 ? span + Math.abs(next.x - point.x) : span }, 0)
  const flipped = cut.map(point => ({ x: point.x, y: top + bottom - point.y }))
  const upright = footOf(flipped) > footOf(cut) + .5 ? flipped : cut
  const tape = new Path2D()
  upright.forEach((point, i) => { const x = (point.x - left) / (right - left) * box.width, y = (point.y - top) / (bottom - top) * box.height; if (i) tape.lineTo(x, y); else tape.moveTo(x, y) })
  tape.closePath()
  ctx.save(); ctx.translate(centreX, centreY); ctx.rotate(angle); ctx.translate(-box.width / 2, -box.height / 2)
  ctx.fillStyle = fill; ctx.fill(tape)
  ctx.fillStyle = ink; ctx.textAlign = 'left'; ctx.fillText(text, padX, padTop + capHeight)
  ctx.restore()
  return box.width
}

/** The same rectangles drive either two-photo arrangement and the optional four-photo layout. */
export function coverFrames(count: number, orientation: Issue['cover']['orientation']) {
  const gap = 8, columns = count === 4 || orientation === 'vertical' ? 2 : 1, rows = count / columns
  const w = (WIDTH - gap * (columns - 1)) / columns, h = (HEIGHT - gap * (rows - 1)) / rows
  return Array.from({ length: count }, (_, i) => ({ x: (i % columns) * (w + gap), y: Math.floor(i / columns) * (h + gap), w, h }))
}
function tintedMark(ctx: CanvasRenderingContext2D, image: HTMLImageElement | undefined, x: number, y: number, width: number, colour: string) {
  if (!image) return
  const height = width * image.naturalHeight / image.naturalWidth
  const layer = document.createElement('canvas'); layer.width = Math.ceil(width * 2); layer.height = Math.ceil(height * 2)
  const ink = layer.getContext('2d')!
  ink.drawImage(image, 0, 0, layer.width, layer.height)
  ink.globalCompositeOperation = 'source-in'; ink.fillStyle = colour; ink.fillRect(0, 0, layer.width, layer.height)
  ctx.drawImage(layer, x, y, width, height)
}
function drawCover(ctx: CanvasRenderingContext2D, issue: Issue, brand: Brand, assets: Record<string, HTMLImageElement>, errors: string[]) {
  const c = issue.cover, look = coverLook(issue, designUnlocked()), isNew = issue.series === 'new'
  const divider = look.divider === 'light' ? brand.light : look.divider === 'yellow' ? brand.yellow : brand.dark
  ctx.fillStyle = divider; ctx.fillRect(0, 0, WIDTH, HEIGHT)
  coverFrames(look.count, c.orientation).forEach(({x,y,w,h}, i) => {
    const source = coverPhoto(issue,i)
    photo(ctx, assets[source], c.crops[i], x, y, w, h, c.scrim)
    if (!source) errors.push(`Choose a photo for collage position ${i+1}.`)
  })
  const markInk = look.markColour === 'yellow' ? brand.yellow : look.markColour === 'dark' ? brand.dark : brand.light
  const logo = assets[`/logo-${look.logoPosition === 'left' ? 'left' : 'right'}.svg`], arrow = assets['/swipe-arrow.svg']
  const logoFoot = SAFE + (logo ? LOGO_WIDTH * logo.naturalHeight / logo.naturalWidth : 87), arrowTop = HEIGHT - SAFE - (arrow ? ARROW_WIDTH * arrow.naturalHeight / arrow.naturalWidth : 87)
  if (look.logoPosition !== 'off') tintedMark(ctx, logo, look.logoPosition === 'left' ? SAFE : WIDTH - SAFE - LOGO_WIDTH, SAFE, LOGO_WIDTH, markInk)
  tintedMark(ctx, arrow, WIDTH - SAFE - ARROW_WIDTH, arrowTop, ARROW_WIDTH, markInk)

  const size = brand.coverSize, tracking = size * brand.coverTracking / 100, lineStep = size * brand.coverLineHeight
  font(ctx, size, 700, false, c.title)
  // Keep deliberate line breaks and the specified type size. Long copy gets a visible fit warning.
  const labels = c.title.trim().split('\n')
  if (!c.title.trim()) errors.push('Add a cover headline.')
  if (labels.length > 4) errors.push('The cover headline is too long. Keep it to four lines.')
  const widths = labels.map(line => trackedWidth(ctx, line, tracking))
  const metrics = labels.map(line => ctx.measureText(line || 'H'))
  const ascent = Math.max(...metrics.map(metric => metric.actualBoundingBoxAscent))
  const descent = Math.max(0, ...metrics.map(metric => metric.actualBoundingBoxDescent))
  const maxWidth = Math.max(...widths, 1)
  // Shaun's boxes (2 Oct) around the default headlines: Picks 639 × 601, What’s New 689 × 617.
  // Each grew evenly around the old box, so the lettering stays where it was.
  const padX = isNew ? 68.5 : 82, padTop = isNew ? 62 : 59, padBottom = isNew ? 77 : 64
  const subtitle = look.showSubtitle ? c.subtitle.trim() : ''
  font(ctx, brand.subtitleSize, 500, false, look.showSubtitle ? c.subtitle : '')
  const onTape = look.subtitlePosition === 'tape'
  // At the foot, the supporting line keeps clear of the arrow beside it.
  const subLines = subtitle ? wrap(ctx, subtitle, onTape ? maxWidth : WIDTH - 2*SAFE - ARROW_WIDTH - 40) : []
  const subStep = brand.subtitleSize * 1.02
  if (subLines.length > 3) errors.push('Keep the supporting line to three lines.')
  const subHeight = onTape && subtitle ? subLines.length * subStep + 28 : 0
  const width = maxWidth + padX * 2, height = ascent + descent + (labels.length-1) * lineStep + padTop + padBottom + subHeight
  const x = (WIDTH-width)/2, y = (HEIGHT-height) * c.position/100
  // The lettering keeps to the safe area; the tape keeps clear of the logo above and the arrow below.
  if (maxWidth > WIDTH - 2*SAFE || y < logoFoot + 48 || y + height > arrowTop - 40) errors.push('The cover headline needs more room. Adjust its line breaks or position.')

  const shape = buildShape({ ...defaults, fontSize:size, align:'left', mode:'rough', lineGap:lineStep-ascent-descent, hugStrength:1, seed:18473562 }, labels, labels.map(() => maxWidth), [], { ascent, descent })
  const box = shape.viewBox
  const background = c.backgrounds[issue.series] || { x,y,width,height }
  // The cut is drawn upside down: its wider strip runs under the last line, so the block stands on it.
  ctx.save(); ctx.translate(background.x,background.y+background.height); ctx.scale(background.width/box.width,-background.height/box.height); ctx.translate(-box.x,-box.y)
  ctx.fillStyle = isNew ? brand.yellow : brand.light; ctx.fill(new Path2D(shape.path)); ctx.restore()
  ctx.fillStyle = brand.dark; font(ctx,size,700,false,c.title)
  labels.forEach((line,i) => trackedText(ctx,line,x+padX,y+padTop+ascent+i*lineStep,tracking))

  if (subtitle) {
    font(ctx,brand.subtitleSize,500,false,subtitle); ctx.fillStyle = onTape ? brand.dark : brand.light
    // Its last line sits on the safe area's foot, level with the foot of the arrow.
    const subtitleY = onTape ? y + height - padBottom - subHeight + 28 + brand.subtitleSize*.78 : HEIGHT - SAFE - (subLines.length-1)*subStep
    subLines.forEach((line,i) => ctx.fillText(line,onTape?x+padX:SAFE,subtitleY+i*subStep))
    if (!onTape && y+height+30 > subtitleY-brand.subtitleSize) errors.push('The headline and supporting line are too close. Move the headline up.')
  }

  if(background.x > x+padX || background.y > y+padTop || background.x+background.width < x+padX+maxWidth || background.y+background.height < y+height-padBottom)errors.push('The headline extends beyond its background. Expand the background box.')
  const date = c.date.toUpperCase()
  if (date) {
    // A tag on the headline's tape, every AD tag's style: ExtraBold capitals on clean-cut tape.
    const dw = drawTag(ctx, date, WIDTH/2, y-20, 48, brand.dateWeight, -.018, isNew ? brand.light : brand.yellow, brand.dark, 18473562)
    if (dw > WIDTH - 2*SAFE) errors.push('The cover date is too long.')
  }
  return { background, headline: { x, y, width, height } }
}

export async function preparePhoto(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose a JPG, PNG or WebP photo.')
  if (file.size > 30 * 1024 * 1024) throw new Error('Choose a photo smaller than 30 MB.')
  const url = URL.createObjectURL(file)
  try {
    const image = await loadImage(url)
    const factor = Math.min(1, 2160 / Math.max(image.naturalWidth,image.naturalHeight))
    const canvas = document.createElement('canvas'); canvas.width = Math.round(image.naturalWidth*factor); canvas.height = Math.round(image.naturalHeight*factor)
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(image,0,0,canvas.width,canvas.height)
    return canvas.toDataURL('image/jpeg',.9)
  } finally { URL.revokeObjectURL(url); images.delete(url); loaded.delete(url) }
}

const SAMPLE_COPY = [
  [
    'You’re in Dublin and looking for a good night out? This one brings together **live acoustic music**, a candlelit room and a different line-up every week.',
    'Grab a few friends, find a seat near the front and settle in for the evening.',
    'There’s something about being close enough to the stage to catch every small detail of a performance.',
    'A quiet opening song can turn into the one everyone is still talking about on the way home.',
    'Go with someone who shares your taste, or bring a friend who might find a new favourite.',
    'The room fills up quickly, so it’s worth getting there a little early for a good spot.',
    'Leave time afterwards for a wander and a chat about the moments that stayed with you.',
    'Sometimes the best plans are the ones that give an ordinary week a different rhythm.',
    'Put the phone away for a while, listen closely and enjoy being in the room.',
    'Whether you’re a regular or it’s your first time, you’ll feel right at home.',
    'It’s the kind of night that reminds you why live music matters.',
  ],
  [
    'An evening to slow down, **pick up a brush** and make a little room for creativity.',
    'Gather a few friends, choose your colours and enjoy trying something outside your usual routine.',
    'The best part is often the conversation that happens while everyone is concentrating on something different.',
    'Start with a small idea and see where it takes you, without worrying about a perfect finished piece.',
    'Notice the shapes, textures and colour combinations that catch your eye along the way.',
    'A shared table is a good place to swap ideas, laugh at the unexpected results and start again.',
    'Everything you need is provided, so all you have to bring is yourself.',
    'Take a break when you need one, then come back with a fresh pair of eyes.',
    'No experience is needed and every level is welcome.',
    'Bring your curiosity and leave a little room for a happy accident.',
    'You’ll leave with something you made yourself, and maybe a new habit.',
  ],
  [
    '**Big stories belong on a big screen.** Make time for a film, a proper catch-up and an evening that feels a little different.',
    'There’s a particular pleasure in stepping away from the usual routine and letting a story hold your attention.',
    'Choose something you’ve been meaning to see, or take a chance on a title you know very little about.',
    'Arrive with enough time to settle in and enjoy the anticipation before the lights go down.',
    'The conversation afterwards can be almost as memorable as the film itself.',
    'Compare your favourite scenes, argue gently about the ending and see which details everyone noticed.',
    'A familiar cinema can still offer a completely unexpected night out.',
    'Grab a drink beforehand and make an evening of it.',
    'Keep the rest of the night open and follow the conversation wherever it goes.',
    'Some films are simply better shared with a full room.',
  ],
  [
    'A good horror programme brings together **new discoveries**, familiar favourites and the shared anticipation of a darkened cinema.',
    'There’s room for the quietly unsettling, the wonderfully strange and the scenes that keep a whole audience on edge.',
    'Part of the fun is comparing reactions afterwards and finding out which moments stayed with everyone.',
    'Leave a little breathing space between films for a drink, a walk and a chat about what you’ve just seen.',
    'Go in with an open mind and let something unexpected become the highlight.',
    'A festival is as much about the people gathered around it as the stories on screen.',
    'Bring a friend who enjoys a surprise and make your own small tradition of the occasion.',
    'Late-night screenings have an energy all of their own.',
    'Popular screenings tend to sell out, so it’s worth planning ahead.',
    'The best discoveries are not always the ones you planned for.',
  ],
]
/** Short lines, longest first, that top up the last line once no full sentence fits. */
const CLOSERS = ['Booking is advised.', 'Bring a friend.', 'Don’t miss it.', 'See you there.', 'All welcome.', 'Enjoy.']

/** Sample copy that runs each inside page to its last line, measured with the renderer's own wrapping.
 *  Pages alternate: one block of text (as the guides usually run), then two paragraphs. */
export function fillPreviewText(issue: Issue, brand: Brand) {
  const ctx=document.createElement('canvas').getContext('2d')!
  issue.stories.forEach((story,index)=>{
    variableFont(ctx,brand.titleSize,brand.titleWeight,story.title.toUpperCase())
    const width=WIDTH-brand.margin*2,lines=wrap(ctx,story.title.toUpperCase(),width).length
    const top=pictureHeight(story,brand)+78+lines*brand.titleSize*1.02+30
    const paragraphs: string[][]=[[]]
    const text=()=>paragraphs.filter(p=>p.length).map(p=>p.join(' ')).join('\n\n')
    const bottom=()=>drawBody(ctx,text(),brand.margin,top,width,brand,'#000','#000',false)
    const add=(sentence: string)=>{
      const paragraph=paragraphs[paragraphs.length-1]
      paragraph.push(sentence)
      if(bottom()>BODY_BOTTOM)paragraph.pop()
    }
    const middle=(top+BODY_BOTTOM)/2
    for(const sentence of SAMPLE_COPY[index%SAMPLE_COPY.length]){
      // Two-paragraph pages break at the sentence that ends closest to halfway down the room.
      if(index%2&&paragraphs.length===1&&paragraphs[0].length){
        const before=bottom()
        paragraphs[0].push(sentence);const after=bottom();paragraphs[0].pop()
        if(after>middle&&after-middle>middle-before)paragraphs.push([])
      }
      add(sentence)
    }
    CLOSERS.forEach(add)
    story.body=text()
  })
}
