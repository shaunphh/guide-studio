/**
 * Reading a Google Sheet tab from its link, as the event guide reads the events Sheet (app.js there):
 * Google's GViz endpoint as a script, so no sign-in or server is needed, then the tab's CSV export if
 * that is blocked. Either way the Sheet must be shared with anyone who has the link. Any Sheet's link
 * works, not only the events Sheet.
 */
import { rowsFromCsv } from './event-source.js'

/** A Sheet tab: the spreadsheet's id and the tab's gid ('' when the link names no tab: the first tab). */
export type SheetSource = { id: string; gid: string }
/** A tab's cells as text, its first row the column names. `typed` names the columns Google holds as dates or times. */
export type SheetTable = { headers: string[]; rows: string[][]; typed: string[] }

const SHARE_HINT = 'Check it’s shared: Share → General access → Anyone with the link → Viewer.'

/** The spreadsheet and tab in a Google Sheet link, as copied from the address bar with the tab open, or from Share. */
export function parseSheetLink(value: string): SheetSource {
  let url: URL
  try { url = new URL(value.trim()) } catch { throw new Error('Paste the Sheet’s link: open its tab and copy the address.') }
  if (/\/spreadsheets\/d\/e\//.test(url.pathname)) throw new Error('That’s a “Publish to web” link. Paste the Sheet’s own link instead: open its tab and copy the address.')
  const id = /\/spreadsheets\/d\/([\w-]{20,})/.exec(url.pathname)?.[1]
  if (url.hostname !== 'docs.google.com' || !id) throw new Error('That isn’t a Google Sheet link. It starts https://docs.google.com/spreadsheets/d/')
  const gid = url.searchParams.get('gid') ?? new URLSearchParams(url.hash.slice(1)).get('gid') ?? ''
  if (gid && !/^\d+$/.test(gid)) throw new Error('That link’s tab isn’t readable. Open the tab and copy the address.')
  return { id, gid }
}

type GvizColumn = { label?: string; type?: string }
type GvizResponse = { status?: string; errors?: { detailed_message?: string }[]; table?: { cols?: GvizColumn[]; rows?: { c?: ({ v?: unknown; f?: string | null } | null)[] }[] } }

/** GViz's answer as text cells, the way the event guide reads it: dates as Date(y,m,d) so no year is lost, else what the cell shows. */
export function gvizTable(response: GvizResponse): SheetTable {
  if (!response || response.status !== 'ok' || !response.table) throw new Error(response?.errors?.[0]?.detailed_message || 'Google sent back something unreadable.')
  const columns = response.table.cols ?? []
  const rows = (response.table.rows ?? []).map(row => columns.map((column, index) => {
    const cell = row.c?.[index]
    if (!cell || cell.v === null || cell.v === undefined) return ''
    if (column.type === 'date' && /^Date\(/.test(String(cell.v))) return String(cell.v)
    if (cell.f !== null && cell.f !== undefined) return String(cell.f)
    if (typeof cell.v === 'boolean') return cell.v ? 'TRUE' : 'FALSE'
    return String(cell.v)
  }))
  // Google gives a column one type; in a column it holds as dates, a cell typed as text (22–26 Oct) comes back empty.
  const typed = columns.filter(column => ['date', 'datetime', 'timeofday'].includes(column.type ?? '')).map(column => column.label ?? '')
  return { headers: columns.map(column => column.label ?? ''), rows, typed }
}

let calls = 0
function viaGviz({ id, gid }: SheetSource): Promise<SheetTable> {
  return new Promise((resolve, reject) => {
    const name = `__guideStudioSheet${Date.now()}_${calls++}`, script = document.createElement('script')
    const scope = window as unknown as Record<string, unknown>
    const done = (error: Error | null, table?: SheetTable) => { window.clearTimeout(timer); script.remove(); delete scope[name]; if (error) reject(error); else resolve(table!) }
    const timer = window.setTimeout(() => done(new Error('The Sheet took too long to answer.')), 10000)
    scope[name] = (response: GvizResponse) => { try { done(null, gvizTable(response)) } catch (error) { done(error as Error) } }
    script.src = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?${gid ? `gid=${gid}&` : ''}headers=1&tqx=${encodeURIComponent(`out:json;responseHandler:${name}`)}&t=${Date.now()}`
    script.referrerPolicy = 'no-referrer'
    script.onerror = () => done(new Error('Google wouldn’t share the Sheet.'))
    document.head.append(script)
  })
}

async function viaCsv({ id, gid }: SheetSource): Promise<SheetTable> {
  const controller = new AbortController(), timer = window.setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch(`https://docs.google.com/spreadsheets/d/${id}/export?format=csv${gid ? `&gid=${gid}` : ''}&t=${Date.now()}`, { cache: 'no-store', signal: controller.signal })
    if (response.status === 410) throw new Error('That Sheet has been deleted.')
    if (!response.ok) throw new Error(`Google answered ${response.status}.`)
    return { ...rowsFromCsv(await response.text()), typed: [] }
  } finally { window.clearTimeout(timer) }
}

/** The tab's cells, read anonymously. */
export async function loadSheet(source: SheetSource): Promise<SheetTable> {
  try { return await viaGviz(source) }
  catch {
    try { return await viaCsv(source) }
    catch (error) { throw new Error((error as Error).message === 'That Sheet has been deleted.' ? 'That Sheet has been deleted.' : `Couldn’t read that Sheet. ${SHARE_HINT}`) }
  }
}

/** The last Sheet link used for each kind of guide, remembered by this browser like the event guide's tab. */
const LINK_KEY = 'guide-studio-sheet-link'
export function savedSheetLink(series: string) {
  try { return localStorage.getItem(`${LINK_KEY}-${series}`) ?? '' } catch { return '' }
}
export function saveSheetLink(series: string, link: string) {
  try { localStorage.setItem(`${LINK_KEY}-${series}`, link.trim()) } catch { /* The field still works without browser storage. */ }
}
