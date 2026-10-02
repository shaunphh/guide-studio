import { POST_FRAME } from './settings'

/** The cover the photo sits behind: a post unless given. */
type Size = { width: number; height: number }

/**
 * How an uploaded photo sits behind the cover. `x` and `y` run 0–100% across the range the photo
 * can travel (0 shows its left or top edge, 50 is centred); `zoom` is 1 when the photo just
 * covers the cover.
 */
export interface PhotoView {
  x: number
  y: number
  zoom: number
}

export const CENTRED: PhotoView = { x: 50, y: 50, zoom: 1 }
export const MAX_ZOOM = 3

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, Number.isFinite(value) ? value : low))

export const clampView = (view: PhotoView): PhotoView => ({ x: clamp(view.x, 0, 100), y: clamp(view.y, 0, 100), zoom: clamp(view.zoom, 1, MAX_ZOOM) })

/** Where the photo is drawn on the artboard. It always covers the whole cover. */
export function photoRect(width: number, height: number, view: PhotoView, frame: Size = POST_FRAME) {
  const { x, y, zoom } = clampView(view)
  const scale = Math.max(frame.width / width, frame.height / height) * zoom
  const drawn = { width: width * scale, height: height * scale }
  return { x: (frame.width - drawn.width) * x / 100, y: (frame.height - drawn.height) * y / 100, ...drawn, scale }
}

/** How far the photo can travel on each axis, in artboard pixels. Zero when it only just covers that way. */
export function photoSlack(width: number, height: number, view: PhotoView, frame: Size = POST_FRAME) {
  const rect = photoRect(width, height, view, frame)
  return { x: Math.max(0, rect.width - frame.width), y: Math.max(0, rect.height - frame.height) }
}

/** The part of the photo the cover shows, in the photo's own pixels. */
export function visiblePart(width: number, height: number, view: PhotoView, frame: Size = POST_FRAME) {
  const rect = photoRect(width, height, view, frame)
  return { x: -rect.x / rect.scale, y: -rect.y / rect.scale, width: frame.width / rect.scale, height: frame.height / rect.scale }
}

/** The view after dragging the photo by `dx`, `dy` artboard pixels: the photo follows the pointer and stops at its edges. */
export function dragPhoto(width: number, height: number, view: PhotoView, dx: number, dy: number, frame: Size = POST_FRAME): PhotoView {
  const from = clampView(view)
  const slack = photoSlack(width, height, from, frame)
  return {
    x: slack.x > 0.5 ? clamp(from.x - dx / slack.x * 100, 0, 100) : from.x,
    y: slack.y > 0.5 ? clamp(from.y - dy / slack.y * 100, 0, 100) : from.y,
    zoom: from.zoom,
  }
}
