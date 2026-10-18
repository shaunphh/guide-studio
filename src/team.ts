/**
 * The team library on Supabase (18 October 2026): sign-in by email link, the guides the team has
 * shared, opening one into this browser and saving a copy back, with the photos in a public bucket.
 * Loaded only when the build has a project (teamConfig.ts) and someone signs in, so a signed-out
 * browser carries none of it. Turn-taking, not two cursors in one page: a save that lands after
 * someone else's comes back as a conflict for the person to settle.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { TEAM } from './teamConfig'
import { sanitizeIssue, type Issue } from './model'
import { photoUploads, referencedPaths, withPhotoUrls, type TeamRow } from './teamModel'

const BUCKET = 'guides'
const ROW = 'id,name,series,updated_at,updated_by'
let client: SupabaseClient | null = null
const supabase = () => (client ??= createClient(TEAM.url, TEAM.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }))
const fail = (what: string, error: { message: string } | null) => { if (error) throw new Error(`${what}: ${error.message}`) }

export async function currentEmail() {
  const { data } = await supabase().auth.getSession()
  return data.session?.user.email ?? null
}
export function onChange(handler: (email: string | null) => void) {
  supabase().auth.onAuthStateChange((_event, session) => handler(session?.user.email ?? null))
}
export async function sendLink(email: string, redirectTo: string) {
  const { error } = await supabase().auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } })
  fail('Couldn’t send the link', error)
}
export async function signOut() { await supabase().auth.signOut() }

export async function listGuides(): Promise<TeamRow[]> {
  const { data, error } = await supabase().from('guides').select(ROW).order('updated_at', { ascending: false })
  fail('Couldn’t read the team’s guides', error)
  return (data ?? []) as TeamRow[]
}

/** A team guide as a copy for this browser, linked to the row it came from. */
export async function openGuide(id: string): Promise<{ issue: Issue; row: TeamRow }> {
  const { data, error } = await supabase().from('guides').select('*').eq('id', id).single()
  fail('Couldn’t open that guide', error)
  const row = data as TeamRow & { issue: unknown }
  const issue = sanitizeIssue(row.issue)
  issue.id = row.id
  issue.team = { updatedAt: row.updated_at, by: row.updated_by, synced: issue.updated }
  return { issue, row }
}

/** Where the bucket's public addresses start, with its trailing slash. */
const publicBase = () => supabase().storage.from(BUCKET).getPublicUrl('x').data.publicUrl.replace(/x$/, '')

/**
 * This browser's copy to the team: photos still held as data go up first, then the row. A linked guide is
 * updated only if the team copy is still the one this browser took; otherwise the newer row comes back as
 * a conflict (`force` overwrites it). The guide comes back with its photos at their addresses and the link set.
 */
export async function saveGuide(issue: Issue, email: string, force = false): Promise<{ saved: Issue; row: TeamRow } | { conflict: TeamRow }> {
  const storage = supabase().storage.from(BUCKET)
  const urls = new Map<string, string>()
  for (const upload of photoUploads(issue)) {
    const blob = await (await fetch(upload.dataUrl)).blob()
    const { error } = await storage.upload(upload.path, blob, { contentType: blob.type || 'image/jpeg', upsert: true })
    fail('Couldn’t upload a photo', error)
    urls.set(upload.dataUrl, storage.getPublicUrl(upload.path).data.publicUrl)
  }
  const { team, ...rest } = withPhotoUrls(issue, dataUrl => urls.get(dataUrl))
  const record = { id: issue.id, name: issue.name, series: issue.series, issue: rest, updated_by: email }
  let row: TeamRow
  if (!team && !force) {
    const { data, error } = await supabase().from('guides').insert(record).select(ROW).single()
    if (error?.code === '23505') {
      // A row with this id is already on the team: this browser's copy lost its link, or the guide came in by
      // backup from a browser that saved it. The person settles it, as with any other conflict.
      const { data: current, error: readError } = await supabase().from('guides').select(ROW).eq('id', issue.id).maybeSingle()
      fail('Couldn’t save to the team', readError)
      if (current) return { conflict: current as TeamRow }
    }
    fail('Couldn’t save to the team', error)
    row = data as TeamRow
  } else {
    let query = supabase().from('guides').update(record).eq('id', issue.id)
    if (!force && team) query = query.eq('updated_at', team.updatedAt)
    const { data, error } = await query.select(ROW)
    fail('Couldn’t save to the team', error)
    if (data?.length) row = data[0] as TeamRow
    else {
      const { data: current, error: readError } = await supabase().from('guides').select(ROW).eq('id', issue.id).maybeSingle()
      fail('Couldn’t save to the team', readError)
      if (current) return { conflict: current as TeamRow }
      // The row is gone (someone removed the guide): this copy puts it back.
      const { data: again, error: insertError } = await supabase().from('guides').insert(record).select(ROW).single()
      fail('Couldn’t save to the team', insertError)
      row = again as TeamRow
    }
  }
  // Photos the guide no longer uses can go.
  const keep = new Set(referencedPaths(rest, publicBase()))
  const { data: objects } = await storage.list(issue.id)
  const unused = (objects ?? []).map(object => `${issue.id}/${object.name}`).filter(path => !keep.has(path))
  if (unused.length) await storage.remove(unused)
  return { saved: { ...rest, team: { updatedAt: row.updated_at, by: row.updated_by, synced: rest.updated } }, row }
}
