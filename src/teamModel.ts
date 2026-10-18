/**
 * The team library's bookkeeping, apart from the network (team.ts has that): where a guide's photos
 * go in the bucket, the guide with its photos at their addresses, and whether a browser's copy has
 * moved past the team copy. Pure, so the tests cover it.
 */
import type { Issue, Series } from './model'

/** A guide's row in the team library (the `guides` table), without the issue itself. `published` (18 Oct 2026): its stories go to the website. */
export type TeamRow = { id: string; name: string; series: Series; updated_at: string; updated_by: string; published?: boolean }

/** The row Save to team writes: the guide without its link, and the Published tick as its own column, which the website's view reads. */
export function teamRecord(issue: Issue, email: string) {
  const { team: _team, ...rest } = issue
  return { id: issue.id, name: issue.name, series: issue.series, issue: rest, updated_by: email, published: issue.published === true }
}

const isData = (photo: string) => photo.startsWith('data:')
export const isRemote = (photo: string) => /^https?:\/\//.test(photo)

/** A short name for a photo's bytes: a replaced photo gets a new address, so nothing cached shows the old one. */
export function photoHash(dataUrl: string) {
  let h = 5381
  for (let i = 0; i < dataUrl.length; i++) h = ((h * 33) ^ dataUrl.charCodeAt(i)) >>> 0
  return h.toString(16).padStart(8, '0')
}

/** The photos a guide still holds as data, and where each goes: <guide id>/<page>-<hash>.jpg. */
export function photoUploads(issue: Issue): { path: string; dataUrl: string }[] {
  const uploads: { path: string; dataUrl: string }[] = []
  issue.cover.photos.forEach((photo, slot) => { if (isData(photo)) uploads.push({ path: `${issue.id}/cover-${slot + 1}-${photoHash(photo)}.jpg`, dataUrl: photo }) })
  for (const s of issue.stories) if (isData(s.photo)) uploads.push({ path: `${issue.id}/${s.id}-${photoHash(s.photo)}.jpg`, dataUrl: s.photo })
  return uploads
}

/** The guide with its uploaded photos at their addresses; sample and remote photos stay as they are. */
export function withPhotoUrls(issue: Issue, urlOf: (dataUrl: string) => string | undefined): Issue {
  const swap = (photo: string) => (isData(photo) ? urlOf(photo) ?? photo : photo)
  return { ...issue, cover: { ...issue.cover, photos: issue.cover.photos.map(swap) }, stories: issue.stories.map(s => ({ ...s, photo: swap(s.photo) })) }
}

/** The bucket paths a guide refers to, so the photos it no longer uses can go. `publicBase` ends in the bucket's slash. */
export function referencedPaths(issue: Issue, publicBase: string): string[] {
  return [...issue.cover.photos, ...issue.stories.map(s => s.photo)].filter(photo => photo.startsWith(publicBase)).map(photo => decodeURIComponent(photo.slice(publicBase.length)))
}

/** Whether this browser's copy has edits the team copy hasn't got: its `updated` moved since the last save or open. */
export const changedSinceTeam = (issue: Issue) => !!issue.team && issue.updated !== issue.team.synced

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const two = (n: number) => String(n).padStart(2, '0')
/** "jack, today 14:02" or "jack, Sat 17 Oct 14:02": the site's date rule and 24-hour time. */
export function describeSave(row: { updated_at: string; updated_by: string }, now = new Date()) {
  const when = new Date(row.updated_at)
  const day = when.toDateString() === now.toDateString() ? 'today' : `${DAYS[when.getDay()]} ${when.getDate()} ${MONTHS[when.getMonth()]}`
  return `${row.updated_by.split('@')[0]}, ${day} ${two(when.getHours())}:${two(when.getMinutes())}`
}
