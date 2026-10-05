import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { BASE_BRAND, blankStory, coverLook, coverPhoto, footerDate, footerTime, handlesOf, makeIssue, parseImport, pictureHeight, sanitizeBrand, sanitizeIssue, switchSeries } from '../src/model'
import { gvizTable, parseSheetLink } from '../src/sheet'
import { clampBounds, dragBounds } from '../src/cover-bounds'
import { coverFrames } from '../src/render'
import { crc32, zipFiles } from '../src/zip'
import { gxCovers, nearestStatic, stemOf } from '../src/barlow'

describe('house rules for inside pages', () => {
  it('keeps every picture at the house height unless designs are open, without losing a saved height', () => {
    const story = { ...blankStory(), imageHeight: 440 }
    expect(pictureHeight(story, BASE_BRAND, false)).toBe(BASE_BRAND.imageHeight)
    expect(pictureHeight(story, BASE_BRAND, true)).toBe(440)
    expect(pictureHeight({ ...story, imageHeight: null }, BASE_BRAND, true)).toBe(BASE_BRAND.imageHeight)
  })
  it('reads one or two handles however they are typed', () => {
    expect(handlesOf('@venue')).toEqual(['@venue'])
    expect(handlesOf('venue  @artist')).toEqual(['@venue', '@artist'])
    expect(handlesOf('@venue, @artist')).toEqual(['@venue', '@artist'])
    expect(handlesOf('@venue & artist')).toEqual(['@venue', '@artist'])
    expect(handlesOf('')).toEqual([])
  })
  it('turns two Instagram links in an import into two handles', () => {
    const { stories } = parseImport('Title: Two hosts\nBody: Words.\nHandle: https://www.instagram.com/onevenue/ https://instagram.com/otherhost')
    expect(stories[0].handle).toBe('@onevenue @otherhost')
  })
  it('gives sample guides today’s sample text, leaving rewritten stories and other guides alone', () => {
    const today = makeIssue('picks', true), old = JSON.parse(JSON.stringify(today))
    old.stories[0].body = 'You’re in Dublin and looking for a fun night out? The Ruby Sessions at Doyle’s brings together live acoustic music, a candlelit atmosphere and different artists performing every Tuesday.\n\nGrab your friends, come along and enjoy a night of live music.'
    old.stories[1].body = 'An evening to slow down, **pick up a brush** and make a little space for creativity. Gather a few friends…'
    old.stories[1].imageHeight = 440
    old.stories[2].body = 'My own words.'
    const next = sanitizeIssue(old)
    expect(next.stories[0].body).toBe(today.stories[0].body)
    expect(next.stories[1]).toMatchObject({ body: today.stories[1].body, imageHeight: null })
    expect(next.stories[2].body).toBe('My own words.')
    expect(sanitizeIssue({ ...old, sample: false }).stories[0].body).toBe(old.stories[0].body)
  })
})

describe('importing editorial content', () => {
  it('keeps paragraphs and maps footer fields without requiring an event date', () => {
    const { stories } = parseImport('Title: New restaurant\nBody: First paragraph.\n\nSecond paragraph.\nHandle: @venue\n---\nTitle: Concert\nBody: Live music.\nDate: 6 Oct\nTime: 8pm\nVenue: Doyle’s')
    expect(stories).toHaveLength(2)
    expect(stories[0]).toMatchObject({ title:'New restaurant', body:'First paragraph.\n\nSecond paragraph.', handle:'@venue', date:'' })
    expect(stories[1]).toMatchObject({ date:'6 Oct', time:'8pm', venue:'Doyle’s' })
    expect(new Set(stories.map(s=>s.id)).size).toBe(2)
  })
  it('uses the event-guide CSV parser for quoted commas and multiline bodies', () => {
    const { stories } = parseImport('Title,Description,Instagram Link,Location\n"Music, after dark","First line\nSecond line",https://www.instagram.com/thevenue/,Dublin')
    expect(stories[0]).toMatchObject({ title:'Music, after dark', body:'First line\nSecond line', handle:'@thevenue', venue:'Dublin' })
  })
  it('recognises headings and flags missing fields for review', () => {
    const { stories,warnings }=parseImport('# First story\nA paragraph\n## Second story')
    expect(stories.map(s=>s.title)).toEqual(['First story','Second story'])
    expect(warnings).toContain('Story 2 needs body text.')
  })
  // The events Sheet as the event guide reads it: its headers (25 Sep 2026), weekday rows, approval, TOP PICKS.
  const SHEET = ['DATE,NAME,LOCATION,START TIME,Instagram name,EVENT/TICKETS LINK,1st,2nd,Comments,Approved,TOP PICKS',
    'FRIDAY (9),,,,,,,,,,',
    '10/09,Pretty Good Improv x Failed State,The Pearse Centre,8:00 PM,the_pearse_centre,,,,,TRUE,TRUE',
    ',Bingo Bilingo,The Workman’s Club,7:30 PM,https://www.instagram.com/bingobilingo/,,,,,TRUE,FALSE',
    '10/10,Lord of the Rings Quiz,Token,7:30 PM,tokendublin,,,,,TRUE,TRUE',
    '10/10,Not approved yet,Somewhere,9:00 PM,,,,,,FALSE,TRUE'].join('\n')
  it('takes the TOP PICKS from the events Sheet, as the event guide reads it', () => {
    const { stories, warnings } = parseImport(SHEET, 'picks')
    expect(stories.map(s => s.title)).toEqual(['Pretty Good Improv x Failed State', 'Lord of the Rings Quiz'])
    expect(stories[0]).toMatchObject({ handle: '@the_pearse_centre', date: '9 Oct', time: '8pm', venue: 'The Pearse Centre', body: '' })
    expect(stories[1]).toMatchObject({ date: '10 Oct', time: '7:30pm' })
    expect(warnings[0]).toBe('2 of the Sheet’s 3 approved events are ticked TOP PICKS.')
    expect(warnings.some(w => w.includes('needs body text'))).toBe(false)
    // A Blurb column, when the team adds one, becomes the story's text.
    const blurbs = parseImport(SHEET.replace('TOP PICKS', 'TOP PICKS,Blurb').split('\n').map((row, i) => i === 2 ? `${row},"Two improv nights, one stage."` : i ? `${row},` : row).join('\n'), 'picks')
    expect(blurbs.stories[0].body).toBe('Two improv nights, one stage.')
    // With the website's DESCRIPTION column too (the Events Sheet Guide puts it first), BLURB still gives the text.
    const both = parseImport(SHEET.replace('TOP PICKS', 'TOP PICKS,DESCRIPTION,BLURB').split('\n').map((row, i) => i === 2 ? `${row},Improv tonight.,"Two improv nights, one stage."` : i ? `${row},,` : row).join('\n'), 'picks')
    expect(both.stories[0].body).toBe('Two improv nights, one stage.')
  })
  it('says where What’s New stories come from, and when nothing is ticked', () => {
    expect(() => parseImport(SHEET, 'new')).toThrow('That’s the events Sheet, which has no What’s New column.')
    expect(() => parseImport(SHEET.replace(/TRUE\n/g, 'FALSE\n').replace(/TRUE$/, 'FALSE'), 'picks')).toThrow('No approved rows have TOP PICKS ticked.')
  })
  it('writes Sheet times and dates as the footers do', () => {
    expect(['8:00 PM', '7:30 pm', '20:00', '12:00 PM', '00:30', '8:00:00 PM', 'TBC', 'Late'].map(footerTime)).toEqual(['8pm', '7:30pm', '8pm', '12pm', '12:30am', '8pm', '', 'Late'])
    expect(['Date(2026,9,9)', '2026-10-22', '9 Oct', '22–26 Oct', ''].map(footerDate)).toEqual(['9 Oct', '22 Oct', '9 Oct', '22–26 Oct', ''])
  })
  it('reads a stories Sheet loaded from its link: one story to a row, dates and times as footers write them', () => {
    const table = gvizTable({ status: 'ok', table: {
      cols: [{ label: 'Title', type: 'string' }, { label: 'Text', type: 'string' }, { label: 'Instagram', type: 'string' }, { label: 'Date', type: 'date' }, { label: 'Time', type: 'timeofday' }, { label: 'Venue', type: 'string' }],
      rows: [
        { c: [{ v: 'Pretty Good Improv x Failed State' }, { v: 'Two improv nights.\n\nDoors at 7:30pm.' }, { v: 'https://www.instagram.com/the_pearse_centre/' }, { v: 'Date(2026,9,9)', f: '09/10/2026' }, { v: [20, 0, 0, 0], f: '8:00:00 PM' }, { v: 'The Pearse Centre' }] },
        { c: [null, null, null, null, null, null] },
        { c: [{ v: 'IFI Horrorthon' }, { v: 'Five days of horror.' }, { v: '@horrorthon_fest' }, null, null, { v: 'IFI' }] },
      ] } })
    expect(table.typed).toEqual(['Date', 'Time'])
    const { stories, warnings } = parseImport(table, 'new')
    expect(stories).toHaveLength(2)
    expect(stories[0]).toMatchObject({ title: 'Pretty Good Improv x Failed State', body: 'Two improv nights.\n\nDoors at 7:30pm.', handle: '@the_pearse_centre', date: '9 Oct', time: '8pm', venue: 'The Pearse Centre' })
    // The second story's dates were typed as text in a column Google holds as dates, so they came back empty.
    expect(warnings).toContain('Some stories have no Date. If the Sheet shows one, set its Date column to Plain text (Format → Number → Plain text) and load it again.')
    expect(() => parseImport({ headers: ['Name of venue', 'Text'], rows: [['Doyle’s', 'Words.']] }, 'new')).toThrow('No Title column.')
  })
  it('reads the events Sheet from its link as the event guide does, typed dates and all', () => {
    const cols = ['DATE', 'NAME', 'LOCATION', 'START TIME', 'Instagram name', 'Approved', 'TOP PICKS'].map(label => ({ label, type: label === 'DATE' ? 'date' : label === 'Approved' || label === 'TOP PICKS' ? 'boolean' : 'string' }))
    const row = (...values: unknown[]) => ({ c: values.map(v => v === null ? null : { v }) })
    const table = gvizTable({ status: 'ok', table: { cols, rows: [row('Date(2026,9,9)', 'Pretty Good Improv x Failed State', 'The Pearse Centre', '8:00 PM', 'the_pearse_centre', true, true), row(null, 'Bingo Bilingo', 'The Workman’s Club', '7:30 PM', 'bingobilingo', true, false)] } })
    const { stories } = parseImport(table, 'picks')
    expect(stories).toHaveLength(1)
    expect(stories[0]).toMatchObject({ title: 'Pretty Good Improv x Failed State', date: '9 Oct', time: '8pm', handle: '@the_pearse_centre' })
  })
  it('finds the Sheet and tab in the links people copy', () => {
    const id = '1rXUChbT3TuOI3b7NaXpXudph96BhLCfEneSjcGW6kp4'
    expect(parseSheetLink(`https://docs.google.com/spreadsheets/d/${id}/edit?gid=170814515#gid=170814515`)).toEqual({ id, gid: '170814515' })
    expect(parseSheetLink(` https://docs.google.com/spreadsheets/d/${id}/edit#gid=97886486 `)).toEqual({ id, gid: '97886486' })
    expect(parseSheetLink(`https://docs.google.com/spreadsheets/d/${id}/edit?usp=sharing`)).toEqual({ id, gid: '' })
    expect(() => parseSheetLink('https://docs.google.com/spreadsheets/d/e/2PACX-1vQ/pubhtml')).toThrow('“Publish to web” link')
    expect(() => parseSheetLink('https://docs.google.com/document/d/abc/edit')).toThrow('isn’t a Google Sheet link')
    expect(() => parseSheetLink('our sheet')).toThrow('Paste the Sheet’s link')
  })
})
describe('saved projects', () => {
  it('saves separate cover uploads, crops and background bounds for each series', () => {
    const issue=makeIssue('picks',true),stories=structuredClone(issue.stories)
    issue.cover.photos[0]='data:image/jpeg;base64,YWJj'
    issue.cover.backgrounds={picks:{x:210,y:390,width:660,height:610},new:{x:190,y:380,width:700,height:640}}
    issue.cover.crops[0]={x:24,y:68,zoom:1.4}
    const restored=sanitizeIssue(JSON.parse(JSON.stringify(issue)))
    expect(restored).toEqual(issue)
    expect(coverPhoto(restored,0)).toBe(issue.cover.photos[0])
    switchSeries(restored,'new')
    expect(restored.cover.backgrounds.new).toEqual({x:190,y:380,width:700,height:640})
    expect(restored.stories).toEqual(stories)
    restored.cover.photos[0]=''
    expect(coverPhoto(restored,0)).toBe('/photos/cinema.jpg')
  })
  it('drops background boxes dragged before the house sizes once, then keeps new ones', () => {
    const old=JSON.parse(JSON.stringify(makeIssue('new',true)))
    delete old.cover.backgroundsRevision
    old.cover.backgrounds={picks:{x:232,y:381,width:639,height:601},new:{x:208,y:365,width:689,height:617}}
    const next=sanitizeIssue(old)
    expect(next.cover.backgrounds).toEqual({picks:null,new:null})
    next.cover.backgrounds.new={x:190,y:380,width:700,height:640}
    expect(sanitizeIssue(JSON.parse(JSON.stringify(next))).cover.backgrounds.new).toEqual({x:190,y:380,width:700,height:640})
  })
  it('adopts the latest title size and light-body colour once, then preserves later edits', () => {
    expect(sanitizeBrand({...BASE_BRAND,revision:2,titleSize:54,lightBody:'#171717',titleWeight:174})).toMatchObject({revision:8,titleSize:64,lightBody:'#4b4a4a',titleWeight:168,dateWeight:166})
    expect(sanitizeBrand({...BASE_BRAND,titleSize:72,lightBody:'#454545'})).toMatchObject({titleSize:72,lightBody:'#454545'})
  })
  it('takes the shared AD palette and pictures once, then keeps House style edits', () => {
    const saved={...BASE_BRAND,revision:3,yellow:'#ffef3a',dark:'#171717',darkBody:'#d2d2d2',imageHeight:530,titleWeight:174,dateWeight:178}
    const next=sanitizeBrand(saved)
    expect(next).toMatchObject({revision:8,yellow:'#ffed1f',dark:'#101010',darkBody:'#c2c2c2',light:'#f0f0f0',imageHeight:500,titleWeight:168,bodyWeight:400,dateWeight:166})
    expect(sanitizeBrand({...next,titleWeight:172,dateWeight:170})).toMatchObject({titleWeight:172,dateWeight:170})
    // Revision 6 kept its titles and takes the tag weight once.
    expect(sanitizeBrand({...next,revision:6,titleWeight:172,dateWeight:178})).toMatchObject({revision:8,titleWeight:172,dateWeight:166})
    expect(sanitizeBrand({...next,yellow:'#ffee00',imageHeight:520,bodyWeight:500})).toMatchObject({yellow:'#ffee00',imageHeight:520,bodyWeight:500})
  })
  it('takes the smaller story title and picture once (5 Oct 2026), then keeps House style edits', () => {
    const saved={...BASE_BRAND,revision:7,titleSize:69,imageHeight:540,margin:60,titleWeight:172}
    expect(sanitizeBrand(saved)).toMatchObject({revision:8,titleSize:64,imageHeight:500,margin:60,titleWeight:172})
    expect(sanitizeBrand({...BASE_BRAND,titleSize:60,imageHeight:480})).toMatchObject({titleSize:60,imageHeight:480})
  })
  it('draws upright text from the variable font, except what it has no letters for', () => {
    expect(gxCovers('Ruby Sessions @ Doyle’s — 8:30pm · €10, Łukasz & Bożena, Dvořák, Éire')).toBe(true)
    expect(gxCovers('Phở Viet')).toBe(false)
    expect(gxCovers('Late night →')).toBe(false)
    expect([stemOf(400), stemOf(700), stemOf(800), stemOf(178)]).toEqual([71, 141, 166, 178])
    expect([nearestStatic(178), nearestStatic(141), nearestStatic(100)]).toEqual([900, 700, 500])
  })
  it('migrates earlier drafts to approved styles without losing saved content or inactive photo slots', () => {
    const issue=makeIssue('picks',true)
    const old=JSON.parse(JSON.stringify(issue))
    for(const key of ['orientation','scrim','layout','logoPosition','markColour','divider','subtitlePosition'])delete old.cover[key]
    old.cover.subtitle='Keep this for What’s New';old.cover.crops[3]={x:27,y:61,zoom:1.4}
    const next=sanitizeIssue(old)
    expect(next.stories).toEqual(issue.stories)
    expect(next.cover).toMatchObject({subtitle:old.cover.subtitle,slots:old.cover.slots,crops:old.cover.crops,orientation:'vertical',scrim:30,layout:2})
    const migrated=sanitizeBrand({bodySize:38,titleSize:66,coverSize:158,margin:60,imageHeight:480})
    expect(migrated).toEqual({...BASE_BRAND,margin:60})
    expect(sanitizeBrand({...migrated,titleWeight:174,dateWeight:165})).toMatchObject({titleWeight:174,dateWeight:165,bodyWeight:400})
  })
  it('enforces series restrictions without destroying saved options when designs are locked', () => {
    const issue=makeIssue('picks',true)
    Object.assign(issue.cover,{layout:4,orientation:'horizontal',logoPosition:'left',markColour:'dark',divider:'yellow',subtitlePosition:'tape'})
    const saved=sanitizeIssue(JSON.parse(JSON.stringify(issue)))
    expect(coverLook(saved)).toEqual({count:2,logoPosition:'right',markColour:'yellow',divider:'dark',showSubtitle:false,subtitlePosition:'bottom'})
    switchSeries(saved,'new')
    expect(coverLook(saved)).toMatchObject({markColour:'white',showSubtitle:true})
    expect(coverLook(saved,true)).toMatchObject({count:4,logoPosition:'left',markColour:'dark',divider:'yellow',subtitlePosition:'tape'})
    expect(saved.cover.orientation).toBe('horizontal')
  })
  it('round-trips words, uploaded photos, independent cover crops and photo heights', () => {
    const issue=makeIssue('picks',true)
    issue.stories[0].photo='data:image/jpeg;base64,YWJj'
    issue.stories[0].crop={x:17,y:83,zoom:2.4}
    issue.stories[0].imageHeight=390
    issue.cover.crops[0]={x:30,y:61,zoom:1.1}
    expect(sanitizeIssue(JSON.parse(JSON.stringify(issue)))).toEqual(issue)
  })
  it('keeps custom cover copy and event footers when switching series', () => {
    const issue=makeIssue('picks',true),before=structuredClone(issue.stories)
    switchSeries(issue,'new')
    expect(issue.cover.title).toBe('What’s\nNew in\nDublin')
    issue.cover.title='My own title';switchSeries(issue,'picks')
    expect(issue.cover.title).toBe('My own title');expect(issue.stories).toEqual(before)
  })
  it('rejects empty guides and unsafe photo references, clamps corrupt settings', () => {
    expect(()=>sanitizeIssue({stories:[]})).toThrow()
    const issue=makeIssue('new');issue.stories[0].photo='https://untrusted.example/tracker.png';issue.stories[0].crop.zoom=999
    const safe=sanitizeIssue(issue)
    expect(safe.stories[0].photo).toBe('');expect(safe.stories[0].crop.zoom).toBe(3)
    expect(sanitizeBrand({bodySize:NaN,dark:'url(x)',margin:500})).toEqual({...BASE_BRAND,margin:76})
  })
})
describe('cover background editing', () => {
  const box={x:200,y:350,width:650,height:620}
  it('resizes from a fixed opposite edge and moves without changing size', () => {
    expect(dragBounds(box,'nw',-30,20)).toEqual({x:170,y:370,width:680,height:600})
    expect(dragBounds(box,'se',40,50)).toEqual({x:200,y:350,width:690,height:670})
    expect(dragBounds(box,'move',-20,35)).toEqual({x:180,y:385,width:650,height:620})
  })
  it('keeps handles on the canvas and prevents negative-size backgrounds', () => {
    expect(dragBounds(box,'nw',1000,2000)).toEqual({x:750,y:870,width:100,height:100})
    expect(clampBounds({x:999,y:-10,width:600,height:700})).toEqual({x:480,y:0,width:600,height:700})
  })
})
describe('two-photo cover layouts', () => {
  it('starts with neutral photographs and excludes the demo poster even in an older embedded backup', () => {
    const issue=makeIssue('new',true)
    expect(issue.cover.slots.slice(0,2).map(id=>issue.stories.find(s=>s.id===id)?.photo)).toEqual(['/photos/cinema.jpg','/photos/music.jpg'])
    expect(issue.stories[1].coverEligible).toBe(false)
    const old=JSON.parse(JSON.stringify(issue))
    delete old.stories[1].coverEligible
    old.stories[1].photo='data:image/jpeg;base64,'+readFileSync(new URL('../public/photos/art.jpg',import.meta.url)).toString('base64')
    old.cover.slots[0]=old.stories[1].id
    const migrated=sanitizeIssue(old)
    expect(migrated.stories[1].coverEligible).toBe(false)
    expect(migrated.stories[1].photo).toBe(old.stories[1].photo)
    expect(migrated.cover.slots).not.toContain(old.stories[1].id)
    old.stories[1].photo='/photos/cinema.jpg'
    expect(sanitizeIssue(old).stories[1].coverEligible).toBe(true)
  })
  it('uses the full artboard with the same eight-pixel divider in either direction', () => {
    expect(coverFrames(2,'vertical')).toEqual([{x:0,y:0,w:536,h:1350},{x:544,y:0,w:536,h:1350}])
    expect(coverFrames(2,'horizontal')).toEqual([{x:0,y:0,w:1080,h:671},{x:0,y:679,w:1080,h:671}])
    expect(coverFrames(4,'horizontal')).toEqual(coverFrames(4,'vertical'))
  })
})
describe('carousel ZIP export', () => {
  it('writes valid CRCs, payloads and central-directory offsets', async () => {
    const bytes=new TextEncoder().encode('123456789')
    expect(crc32(bytes)).toBe(0xcbf43926)
    const blob=zipFiles([{name:'01-cover.png',bytes},{name:'02-story.png',bytes}])
    const data=new Uint8Array(await blob.arrayBuffer()),view=new DataView(data.buffer)
    expect(view.getUint32(0,true)).toBe(0x04034b50)
    expect(view.getUint32(14,true)).toBe(crc32(bytes))
    const end=data.length-22,offset=view.getUint32(end+16,true)
    expect(view.getUint32(end,true)).toBe(0x06054b50)
    expect(view.getUint16(end+10,true)).toBe(2)
    expect(view.getUint32(offset,true)).toBe(0x02014b50)
    expect(view.getUint32(offset+42,true)).toBe(0)
  })
})
