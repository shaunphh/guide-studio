import { describe, expect, it } from 'vitest'
import { makeIssue, sanitizeIssue } from '../src/model'
import { changedSinceTeam, describeSave, photoHash, photoUploads, referencedPaths, teamRecord, withPhotoUrls } from '../src/teamModel'

const BASE = 'https://x.supabase.co/storage/v1/object/public/guides/'

describe('the team library', () => {
  it('plans an upload for every photo still held as data, named by its bytes', () => {
    const issue = makeIssue('picks')
    issue.stories[0].photo = 'data:image/jpeg;base64,AAAA'
    issue.cover.photos[0] = 'data:image/jpeg;base64,BBBB'
    expect(photoUploads(issue).map(u => u.path)).toEqual([
      `${issue.id}/cover-1-${photoHash('data:image/jpeg;base64,BBBB')}.jpg`,
      `${issue.id}/${issue.stories[0].id}-${photoHash('data:image/jpeg;base64,AAAA')}.jpg`,
    ])
    expect(photoHash('a')).not.toBe(photoHash('b'))
    expect(photoHash('a')).toHaveLength(8)
  })
  it('swaps uploaded photos for their addresses and leaves sample and remote ones alone', () => {
    const issue = makeIssue('picks', true)
    issue.stories[0].photo = 'data:image/jpeg;base64,AAAA'
    const out = withPhotoUrls(issue, d => (d === 'data:image/jpeg;base64,AAAA' ? BASE + `${issue.id}/a.jpg` : undefined))
    expect(out.stories[0].photo).toBe(BASE + `${issue.id}/a.jpg`)
    expect(out.stories[1].photo).toBe(issue.stories[1].photo)
    expect(referencedPaths(out, BASE)).toEqual([`${issue.id}/a.jpg`])
  })
  it('knows when this browser’s copy has moved past the team copy', () => {
    const issue = makeIssue('picks')
    expect(changedSinceTeam(issue)).toBe(false)
    issue.team = { updatedAt: '2026-10-18T12:00:00+00:00', by: 'jack@example.com', synced: issue.updated }
    expect(changedSinceTeam(issue)).toBe(false)
    issue.updated = '2026-10-18T12:05:00.000Z'
    expect(changedSinceTeam(issue)).toBe(true)
  })
  it('keeps a whole team link through a save and drops a broken one', () => {
    const issue = makeIssue('picks')
    issue.team = { updatedAt: '2026-10-18T12:00:00+00:00', by: 'jack@example.com', synced: issue.updated }
    expect(sanitizeIssue(JSON.parse(JSON.stringify(issue))).team).toEqual(issue.team)
    expect(sanitizeIssue({ ...issue, team: { by: 'jack@example.com' } }).team).toBeUndefined()
  })
  it('says who saved and when', () => {
    expect(describeSave({ updated_at: '2026-10-18T13:02:00Z', updated_by: 'jack@example.com' }, new Date('2026-10-18T15:00:00Z'))).toMatch(/^jack, today \d\d:\d\d$/)
    expect(describeSave({ updated_at: '2026-10-17T13:02:00Z', updated_by: 'jack@example.com' }, new Date('2026-10-18T15:00:00Z'))).toMatch(/^jack, Sat 17 Oct \d\d:\d\d$/)
  })
  it('writes the Published tick as its own column, and keeps the link out of the row (18 Oct 2026)', () => {
    const issue = makeIssue('new')
    issue.team = { updatedAt: '2026-10-18T12:00:00+00:00', by: 'jack@example.com', synced: issue.updated }
    const row = teamRecord(issue, 'shaun@example.com')
    expect(row.published).toBe(false)
    expect(row.updated_by).toBe('shaun@example.com')
    expect('team' in row.issue).toBe(false)
    issue.published = true
    expect(teamRecord(issue, 'shaun@example.com').published).toBe(true)
    // A guide from a backup or an older build has no tick: it is unpublished until someone ticks it.
    expect(sanitizeIssue({ ...issue, published: 'yes' }).published).toBe(false)
    expect(sanitizeIssue({ ...issue, published: true }).published).toBe(true)
  })
})
