import './styles.css'
import { BASE_BRAND, blankStory, clone, coverLook, coverPhoto, designUnlocked, crop, makeIssue, newId, parseImport, pictureHeight, readLibrary, sanitizeBrand, sanitizeIssue, saveLibrary, seriesName, switchSeries, type Brand, type Issue, type Library, type Series } from './model'
import { HEIGHT, WIDTH, asset, coverFrames, fillPreviewText, loadFonts, loadedImage, preparePhoto, renderPage } from './render'
import { zipFiles } from './zip'
import { loadSheet, parseSheetLink, saveSheetLink, savedSheetLink } from './sheet'
import { clampBounds, dragBounds, type CoverBounds } from './cover-bounds'
import { dragPhoto } from './tape/photo'

const app = document.querySelector<HTMLDivElement>('#app')!
const escape = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]!)
const icons: Record<string,string> = { plus:'M12 5v14M5 12h14', upload:'M12 16V4m-5 5 5-5 5 5M4 16v4h16v-4', down:'M12 4v12m-5-5 5 5 5-5M4 17v3h16v-3', undo:'M8 4 3 9l5 5M3 9h10a7 7 0 0 1 0 14', redo:'m16 4 5 5-5 5m5-5H11a7 7 0 0 0 0 14', grid:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z', arrow:'m9 5 7 7-7 7', close:'m6 6 12 12M6 18 18 6', check:'m5 12 4 4L19 6', sliders:'M4 7h9m4 0h3M4 17h3m4 0h9M13 4v6M7 14v6', copy:'M8 8h12v13H8zM16 8V3H3v13h5', trash:'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7', image:'M3 3h18v18H3zM3 16l6-6 5 5 3-3 4 4M16 7h.01', up:'m6 14 6-6 6 6', more:'M5 12h.01M12 12h.01M19 12h.01', file:'M6 3h8l4 4v14H6zM14 3v5h5M9 12h6m-6 4h6' }
const icon = (name: string) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${icons[name] || icons.file}"/></svg>`
let library: Library
let selected = 'cover', panel: 'edit'|'style' = 'edit', overview = false, coverSlot = 0, exportScale = 1
let saving = false, saveFailed = false, saveTimer: number, renderToken = 0, historyAt = 0, historyKey = '', lastHistoryTime = 0, busy = false
let history: { issue: Issue; brand: Brand; selected: string }[] = []
let currentErrors: string[] = []
let boundsMode=false, lastCoverBounds: CoverBounds | undefined, lastBoundsKey='', boundsObserver: ResizeObserver | undefined, areaObserver: ResizeObserver | undefined
let saveChain = Promise.resolve()
let importResult: ReturnType<typeof parseImport> | null = null
// Every edit bumps the revision; a thumbnail drawn at an older one is redrawn, others are left alone.
let contentRevision = 0, thumbToken = 0, thumbTimer = 0, drawFrame = 0, drawFallback = 0, dragging = false, lastHeadline: CoverBounds | undefined
/** The page the big canvas last showed, so a rebuilt screen can keep it up until the fresh render lands. */
let shownPage = ''
const issue = () => library.issues.find(i => i.id === library.activeId)!
const story = () => issue().stories.find(s => s.id === selected)
const pageIndex = () => selected === 'cover' ? 0 : issue().stories.findIndex(s => s.id === selected) + 1
const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const currentState = () => ({ issue: clone(issue()), brand: clone(library.brand), selected })

function checkpoint(key: string) {
  const now = Date.now()
  if (historyKey !== key || now - lastHistoryTime > 900) {
    history = history.slice(0, historyAt)
    history.push(currentState()); if (history.length > 24) history.shift()
    historyAt = history.length
  }
  historyKey = key; lastHistoryTime = now
}
function change(key: string, edit: () => void, refresh = false) {
  checkpoint(key); edit(); issue().updated = new Date().toISOString(); markSave()
  if (refresh) renderShell(); else { updateHeader(); scheduleRender() }
}
function undo(direction: -1 | 1) {
  historyKey = ''
  if (direction === -1 && historyAt > 0) {
    if (historyAt === history.length) history.push(currentState())
    historyAt--
  } else if (direction === 1 && historyAt < history.length - 1) historyAt++
  else return
  const snapshot = history[historyAt]
  library.issues = library.issues.map(i => i.id === library.activeId ? clone(snapshot.issue) : i)
  library.brand = clone(snapshot.brand); selected = snapshot.selected; markSave(); renderShell()
}
function markSave() {
  contentRevision++; saveRevision++; saving = true; saveFailed = false; updateSave(); clearTimeout(saveTimer)
  saveTimer = window.setTimeout(flushSave, 400)
}
let saveRevision = 0
async function flushSave() {
  clearTimeout(saveTimer)
  const value = clone(library), revision = ++saveRevision
  saveChain = saveChain.catch(() => {}).then(() => saveLibrary(value))
  try { await saveChain; if (revision === saveRevision) { saving = false; saveFailed = false; updateSave() } }
  catch { saving = false; saveFailed = true; updateSave(); toast('Couldn’t save on this browser. Download a backup to keep your work.', true) }
}
function updateSave() {
  const el = get('save-state'); if (!el) return
  el.className = `save-state ${saveFailed ? 'failed' : ''}`
  el.innerHTML = `${icon(saveFailed ? 'close' : 'check')} ${saveFailed ? 'Not saved · download backup' : saving ? 'Saving…' : 'Saved on this browser'}`
}
function toast(message: string, error = false) {
  get('toast')?.remove()
  const el = document.createElement('div'); el.id = 'toast'; el.className = `toast ${error?'error':''}`; el.setAttribute('role',error?'alert':'status'); el.textContent = message; document.body.append(el)
  window.setTimeout(() => el.remove(), 6000)
}
function resetHistory() { history=[]; historyAt=0; historyKey='' }
function updateHeader() {
  const name = get<HTMLInputElement>('issue-name'); if (name && document.activeElement !== name) name.value = issue().name
  get('page-counter').textContent = `${issue().stories.length + 1} pages`
  get<HTMLButtonElement>('undo').disabled = historyAt <= 0
  get<HTMLButtonElement>('redo').disabled = historyAt >= history.length - 1
  updateSave()
}
const field = (label: string, key: string, value: string, options: { rows?: number; placeholder?: string; hint?: string; disabled?: boolean } = {}) => `<label class="field ${options.disabled?'locked-field':''}"><span>${label}</span>${options.rows ? `<textarea data-field="${key}" rows="${options.rows}" ${options.disabled?'disabled':''} placeholder="${escape(options.placeholder || '')}">${escape(value)}</textarea>` : `<input data-field="${key}" value="${escape(value)}" ${options.disabled?'disabled':''} placeholder="${escape(options.placeholder || '')}">`}${options.hint ? `<small>${options.hint}</small>` : ''}</label>`
const range = (label: string, key: string, value: number, min: number, max: number, step = 1, suffix = '', factor = 1, disabled = false) => `<label class="range-field ${disabled?'locked-field':''}"><span>${label}<output>${Math.round(value*factor*100)/100}${suffix}</output></span><input type="range" aria-label="${label}" data-range="${key}" data-suffix="${suffix}" data-factor="${factor}" min="${min}" max="${max}" step="${step}" value="${value}" ${disabled?'disabled title="Fixed by the house style"':''}></label>`
const choices = (label: string, key: string, value: string | number, options: [string | number,string,boolean?][]) => `<div class="choice-field"><span>${label}</span><div class="choice-buttons" role="group" aria-label="${label}">${options.map(([v,text,disabled])=>`<button data-choice="${key}" data-value="${v}" aria-pressed="${v===value}" ${disabled?'disabled title="Fixed for this series for now"':''}>${text}</button>`).join('')}</div></div>`
const heading = (label: string, detail = '') => `<div class="section-heading"><h3>${label}</h3>${detail?`<span>${detail}</span>`:''}</div>`

const inspectorKind = () => `${issue().id}:${panel==='style'?'style':selected==='cover'?'cover':'story'}`
/** The element to hand focus back to after a rebuild, found again by what it is rather than by node. */
function selectorOf(el: Element | null) {
  if (!(el instanceof HTMLElement) || el === document.body) return ''
  if (el.id) return `#${CSS.escape(el.id)}`
  for (const key of ['choice','page','slot','series','field','range','bounds','format']) {
    const value = el.dataset[key]
    if (value !== undefined) return `[data-${key}="${CSS.escape(value)}"]${key==='choice'?`[data-value="${CSS.escape(el.dataset.value ?? '')}"]`:''}`
  }
  return ''
}
function copyCanvas(from: HTMLCanvasElement, to: HTMLCanvasElement, width = from.width, height = from.height) {
  to.width = width; to.height = height
  const ctx = to.getContext('2d')!; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(from, 0, 0, width, height)
}
/** What a rebuild must not lose: both scroll positions, focus, and the pictures already drawn. */
function keepView() {
  const list = get('page-list'), fields = get('inspector-fields'), thumbs = new Map<string, HTMLCanvasElement>()
  list?.querySelectorAll<HTMLCanvasElement>('[data-thumb]').forEach(c => { if (c.dataset.painted) thumbs.set(`${list.dataset.issue}:${c.closest<HTMLElement>('[data-page]')!.dataset.page}`, c) })
  return { issue: list?.dataset.issue, rail: list?.scrollTop ?? 0, kind: fields?.dataset.kind, fields: fields?.scrollTop ?? 0, focus: selectorOf(document.activeElement), thumbs, board: get<HTMLCanvasElement>('artboard'), page: shownPage }
}
function restoreView(kept: ReturnType<typeof keepView>) {
  const id = issue().id, list = get('page-list'), fields = get('inspector-fields')
  if (kept.issue === id) list.scrollTop = kept.rail
  if (kept.kind === inspectorKind()) fields.scrollTop = kept.fields
  document.querySelectorAll<HTMLCanvasElement>('[data-thumb]').forEach(c => {
    const old = kept.thumbs.get(`${id}:${c.closest<HTMLElement>('[data-page]')!.dataset.page}`)
    if (old) { copyCanvas(old, c); c.dataset.painted = old.dataset.painted }
  })
  // The big canvas keeps its page, or shows the new page's thumbnail, until the full render lands.
  const board = get<HTMLCanvasElement>('artboard'), page = `${id}:${selected}`
  if (board && kept.board?.width && kept.page === page) copyCanvas(kept.board, board)
  else if (board && kept.thumbs.get(page)) copyCanvas(kept.thumbs.get(page)!, board, WIDTH, HEIGHT)
  // Only a page chosen from elsewhere (Overview, a new story, undo) and wholly out of view is brought in.
  const card = list.querySelector<HTMLElement>('.page-card.active')?.getBoundingClientRect(), view = list.getBoundingClientRect()
  if (card && (card.bottom <= view.top || card.top >= view.bottom)) list.querySelector<HTMLElement>('.page-card.active')!.scrollIntoView({ block: 'nearest' })
  if (kept.focus) document.querySelector<HTMLElement>(kept.focus)?.focus({ preventScroll: true })
}

function renderShell() {
  const kept = keepView()
  boundsObserver?.disconnect()
  app.innerHTML = `<header class="topbar"><a class="brand" href="#" aria-label="Guide Studio home"><span class="brand-mark">a/d</span><span>Guide Studio<small>ALTERNATIVE DUBLIN</small></span></a><div class="issue-heading"><input id="issue-name" aria-label="Guide name" value="${escape(issue().name)}"><div id="save-state" class="save-state"></div></div><div class="top-actions"><button id="library" class="quiet">${icon('file')} My guides</button><button id="backup" class="quiet backup-button">${icon('down')} Backup</button><button id="house-style" class="quiet ${panel==='style'?'selected':''}">${icon('sliders')} House style</button><button id="import" class="quiet">${icon('upload')} Import copy</button><button id="export" class="primary">${icon('down')} Export guide</button></div></header>
  <div class="workspace"><aside class="page-rail"><div class="rail-heading"><span>THIS GUIDE</span><span id="page-counter"></span></div><div class="series-switch" role="group" aria-label="Guide series"><button data-series="picks" class="${issue().series==='picks'?'active':''}">Picks</button><button data-series="new" class="${issue().series==='new'?'active':''}">What’s new</button></div><nav id="page-list" aria-label="Pages" title="↑ and ↓ move between pages" data-issue="${escape(issue().id)}"></nav><button id="add-page" class="add-page">${icon('plus')} Add story</button><div class="rail-bottom"><span class="small-dot"></span> 1080 × 1350 · Instagram</div></aside>
  <main class="stage"><div class="stage-toolbar"><div><button id="undo" class="icon-button" title="Undo" aria-label="Undo">${icon('undo')}</button><button id="redo" class="icon-button" title="Redo" aria-label="Redo">${icon('redo')}</button><span class="divider"></span><span id="selection-title">${selected==='cover'?'Cover':`Story ${pageIndex()}`}</span></div><button id="overview" class="quiet ${overview?'selected':''}">${icon('grid')} ${overview?'Back to editor':'Overview'}</button></div><div id="artboard-area" class="artboard-area ${overview?'overview':''}">${overview ? '<div id="overview-grid"></div>' : '<div class="artboard-wrap"><canvas id="artboard" width="1080" height="1350" aria-label="Guide page preview"></canvas><div id="bounds-layer" class="bounds-layer" hidden><div id="background-box" class="background-box" role="group" aria-label="Headline background bounds" tabindex="0"><span id="bounds-caption" class="bounds-caption"></span><button class="bounds-handle nw" data-handle="nw" aria-label="Resize background top left"></button><button class="bounds-handle n" data-handle="n" aria-label="Resize background top"></button><button class="bounds-handle ne" data-handle="ne" aria-label="Resize background top right"></button><button class="bounds-handle e" data-handle="e" aria-label="Resize background right"></button><button class="bounds-handle se" data-handle="se" aria-label="Resize background bottom right"></button><button class="bounds-handle s" data-handle="s" aria-label="Resize background bottom"></button><button class="bounds-handle sw" data-handle="sw" aria-label="Resize background bottom left"></button><button class="bounds-handle w" data-handle="w" aria-label="Resize background left"></button></div></div></div>'}</div><div class="stage-bottom"><div id="fit-status" role="status">Preparing preview…</div><div>${issue().sample?'<span class="sample-label">Sample content & photos</span>':''}<span>4:5 portrait</span></div></div></main>
  <aside class="inspector"><div class="inspector-title"><div><span class="eyebrow">${panel==='style'?'DESIGN CONTROLS':selected==='cover'?'THE FIRST IMPRESSION':`STORY ${String(pageIndex()).padStart(2,'0')}`}</span><h2>${panel==='style'?'House style':selected==='cover'?'Make an entrance.':'Make it read well.'}</h2></div>${panel==='style'?'<button id="close-style" class="icon-button" aria-label="Close house style">'+icon('close')+'</button>':''}</div><div id="inspector-fields" class="inspector-fields" data-kind="${escape(inspectorKind())}">${panel==='style'?stylePanel():selected==='cover'?coverPanel():storyPanel()}</div><div class="inspector-footer"><button id="export-page" class="secondary">${icon('down')} Download this page</button><label class="resolution"><select id="export-scale" aria-label="Export resolution"><option value="1" ${exportScale===1?'selected':''}>1× PNG</option><option value="2" ${exportScale===2?'selected':''}>2× PNG</option></select></label></div></aside></div>
  <input id="cover-photo-file" type="file" accept="image/jpeg,image/png,image/webp" hidden><input id="photo-file" type="file" accept="image/jpeg,image/png,image/webp" hidden><input id="restore-file" type="file" accept="application/json,.json" hidden><dialog id="modal"></dialog>`
  renderRail(); bindShell(); updateHeader(); restoreView(kept); scheduleRender()
}
function renderRail() {
  get('page-list').innerHTML = [{ id:'cover',title:'Cover',sub:seriesName(issue().series) },...issue().stories.map((s,i)=>({id:s.id,title:s.title||'Untitled story',sub:`Story ${String(i+1).padStart(2,'0')}`}))].map((p,i)=>`<button class="page-card ${selected===p.id?'active':''}" data-page="${escape(p.id)}" aria-label="${i===0?'Cover':`Story ${i}: ${escape(p.title)}`}"><div class="thumb-wrap"><canvas data-thumb="${i}" width="108" height="135"></canvas><span class="page-number">${String(i+1).padStart(2,'0')}</span></div><span class="page-card-title">${escape(p.title)}</span><small>${escape(p.sub)}</small></button>`).join('')
}
function coverPanel() {
  const c = issue().cover, open = designUnlocked(), look = coverLook(issue(),open)
  if (coverSlot >= look.count) coverSlot = 0
  const s = issue().stories.find(s=>s.id===c.slots[coverSlot])
  const fixedColour = issue().series==='picks'?'Yellow':'White'
  return `${field('Date strip','cover.date',c.date)}
  ${field('Headline','cover.title',c.title,{rows:3,hint:'Line breaks are kept in the cover.'})}${boundsPanel()}
  ${field('Supporting line · What’s New','cover.subtitle',c.subtitle,{rows:2,placeholder:'New openings, good stories and more…',disabled:!look.showSubtitle,hint:look.showSubtitle?'Sits at the bottom over the photos.':'Hidden on Picks. Your text stays saved for What’s New.'})}
  <div class="rule"></div>${heading('Cover photos',`${look.count} images`)}
  ${choices('Photo count','layout',look.count,[[2,'2 photos'],[4,'4 photos',!open]])}
  ${choices('Photo layout','orientation',c.orientation,[['vertical','Side by side',look.count===4],['horizontal','Top & bottom',look.count===4]])}
  <div class="collage-picker ${look.count===2&&c.orientation==='horizontal'?'stacked':''}" role="group" aria-label="Collage position">${c.slots.slice(0,look.count).map((id,i)=>{const photo=coverPhoto(issue(),i);return `<button data-slot="${i}" class="${coverSlot===i?'active':''}" aria-label="Collage position ${i+1}">${photo?`<img src="${escape(photo)}" alt="">`:icon('image')}<span>${i+1}</span></button>`}).join('')}</div>
  <button id="upload-cover-photo" class="secondary cover-upload">${icon('upload')} ${c.photos[coverSlot]?'Replace uploaded photo':'Upload photo'} ${coverSlot+1}</button><label class="field"><span>Photo ${coverSlot+1} · or use a story’s image</span><select id="collage-source">${c.photos[coverSlot]?'<option value="uploaded" selected>Uploaded cover photo</option>':''}${issue().stories.map((s,i)=>({s,i})).filter(({s})=>s.coverEligible).map(({s,i})=>`<option value="${escape(s.id)}" ${!c.photos[coverSlot]&&s.id===c.slots[coverSlot]?'selected':''}>${String(i+1).padStart(2,'0')} · ${escape(s.title||'Untitled story')}</option>`).join('')}</select></label>
  <p class="field-note">${c.photos[coverSlot]?'This upload is saved with the cover; inside pages keep their own photos.':s?.photo?'Each cover crop is independent of its story.':'Upload a cover photo or add one on a story page.'} Choose photographs without poster text or graphic overlays.</p>
  ${cropControls('cover',c.crops[coverSlot])}
  <div class="rule"></div>${range('Photo scrim','cover.scrim',c.scrim,0,80,1,'%')}
  <p class="field-note">Darkens both photos so the text reads clearly. Starts at 30%.</p>
  ${range('Headline position','cover.position',c.position,30,70,1,'%')}
  <p class="field-note">Or drag the headline up and down on the cover. Drag a photo there to reframe it.</p>
  <div class="rule"></div>${heading('Cover details',open?'Design options open':'Fixed for now')}
  ${choices('Logo position','logoPosition',look.logoPosition,[['left','Left',!open],['right','Right'],['off','Off',!open]])}
  ${choices('Logo & arrow colour','markColour',open?c.markColour:'series',open?[['series','Match series'],['yellow','Yellow'],['white','White'],['dark','Ink']]:[['series',fixedColour],[issue().series==='picks'?'white':'yellow',issue().series==='picks'?'White':'Yellow',true],['dark','Ink',true]])}
  ${choices('Photo divider','divider',look.divider,[['dark','Dark'],['light','Light',!open],['yellow','Yellow',!open]])}
  ${look.showSubtitle?choices('Supporting line position','subtitlePosition',look.subtitlePosition,[['bottom','Bottom'],['tape','On tape',!open]]):''}
  <p class="field-note">${open?'Alternative design choices are available in this view.':'Greyed-out choices are kept here for a future design pass.'}</p>`
}

function activeBounds() {
  return issue().cover.backgrounds[issue().series] || (lastBoundsKey===`${issue().id}:${issue().series}`?lastCoverBounds:undefined)
}
function boundsPanel() {
  return `<div class="bounds-panel"><button id="toggle-bounds" class="secondary" aria-pressed="${boundsMode}">${boundsMode?'Hide bounding box':'Adjust tape background'}</button>
  ${boundsMode?`<p class="field-note">Drag the box to move the background, or use its handles to resize. The headline stays in place. Measurements are on the 1080 × 1350 canvas.</p><div class="bounds-fields">${(['x','y','width','height'] as const).map((key,i)=>`<label class="field"><span>${['X · left','Y · top','Width','Height'][i]}</span><input type="number" data-bounds="${key}" aria-label="Background ${key}" step="1" min="${i<2?0:100}" max="${key==='x'||key==='width'?1080:1350}"></label>`).join('')}</div><textarea id="bounds-values" aria-label="Background values" readonly rows="2"></textarea><div class="bounds-actions"><button id="copy-bounds" class="text-button">Copy values</button><button id="reset-bounds" class="text-button">Reset this background</button></div><p class="field-note">Each series keeps its own background. The outline and handles stay out of exports.</p>`:''}</div>`
}
function syncBounds() {
  const layer=get('bounds-layer'),box=get('background-box'),canvas=get<HTMLCanvasElement>('artboard'),bounds=activeBounds()
  if(!layer||!box||!canvas)return
  const visible=boundsMode&&selected==='cover'&&!overview&&!!bounds
  layer.hidden=!visible
  if(!visible||!bounds)return
  const rect=canvas.getBoundingClientRect(),parent=canvas.parentElement!.getBoundingClientRect()
  Object.assign(layer.style,{left:`${rect.left-parent.left}px`,top:`${rect.top-parent.top}px`,width:`${rect.width}px`,height:`${rect.height}px`})
  Object.assign(box.style,{left:`${bounds.x/WIDTH*100}%`,top:`${bounds.y/HEIGHT*100}%`,width:`${bounds.width/WIDTH*100}%`,height:`${bounds.height/HEIGHT*100}%`})
  const rounded=clampBounds(bounds)
  get('bounds-caption').textContent=`X ${rounded.x} · Y ${rounded.y} · ${rounded.width} × ${rounded.height}`
  document.querySelectorAll<HTMLInputElement>('[data-bounds]').forEach(input=>{if(input!==document.activeElement)input.value=String(rounded[input.dataset.bounds as keyof CoverBounds])})
  const values=get<HTMLTextAreaElement>('bounds-values')
  if(values)values.value=`${seriesName(issue().series)} — headline background\nX: ${rounded.x}px; Y: ${rounded.y}px; Width: ${rounded.width}px; Height: ${rounded.height}px`
}
function bindBounds() {
  get('toggle-bounds')?.addEventListener('click',()=>{boundsMode=!boundsMode;renderShell();syncBounds()})
  get('reset-bounds')?.addEventListener('click',()=>change('reset-bounds',()=>{issue().cover.backgrounds[issue().series]=null}))
  get('copy-bounds')?.addEventListener('click',async()=>{
    const values=get<HTMLTextAreaElement>('bounds-values');if(!values)return
    try{await navigator.clipboard.writeText(values.value);toast('Background values copied. Paste them into our chat.')}
    catch{values.focus();values.select();toast('The values are selected. Copy and paste them into our chat.')}
  })
  document.querySelectorAll<HTMLInputElement>('[data-bounds]').forEach(input=>{
    input.oninput=()=>{
      const current=activeBounds(),value=input.valueAsNumber;if(!current||!Number.isFinite(value))return
      change('bounds-'+input.dataset.bounds,()=>{issue().cover.backgrounds[issue().series]=clampBounds({...current,[input.dataset.bounds!]:value})})
      syncBounds()
    }
    input.onblur=()=>syncBounds()
  })
  const box=get('background-box'),canvas=get<HTMLCanvasElement>('artboard')
  if(!box||!canvas)return
  boundsObserver=new ResizeObserver(syncBounds);boundsObserver.observe(canvas)
  let drag: {x:number;y:number;rect:CoverBounds;handle:string} | null=null
  box.onpointerdown=event=>{
    const current=activeBounds();if(!current)return
    event.preventDefault();historyKey='';checkpoint('background-drag')
    drag={x:event.clientX,y:event.clientY,rect:clampBounds(current),handle:(event.target as HTMLElement).closest<HTMLElement>('[data-handle]')?.dataset.handle||'move'}
    box.setPointerCapture(event.pointerId)
  }
  box.onpointermove=event=>{
    if(!drag)return
    const rect=canvas.getBoundingClientRect()
    issue().cover.backgrounds[issue().series]=dragBounds(drag.rect,drag.handle,(event.clientX-drag.x)*WIDTH/rect.width,(event.clientY-drag.y)*HEIGHT/rect.height)
    issue().updated=new Date().toISOString();markSave();syncBounds();scheduleRender()
  }
  const finish=()=>{if(!drag)return;drag=null;historyKey='';updateHeader();scheduleRender()}
  box.onpointerup=finish;box.onpointercancel=finish
  box.onkeydown=event=>{
    const current=activeBounds(),step=event.shiftKey?10:1
    const direction=({ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]} as Record<string,number[]>)[event.key]
    if(!current||!direction)return
    event.preventDefault()
    const handle=(event.target as HTMLElement).dataset.handle||'move'
    change('bounds-key-'+handle,()=>{issue().cover.backgrounds[issue().series]=dragBounds(clampBounds(current),handle,direction[0],direction[1])});syncBounds()
  }
  syncBounds()
}

function cropControls(prefix: string, view: {x:number;y:number;zoom:number}) { return `${range('Zoom',`${prefix}.zoom`,view.zoom,1,3,.01,'×')}${range('Left / right',`${prefix}.x`,view.x,0,100,1,'%')}${range('Up / down',`${prefix}.y`,view.y,0,100,1,'%')}<button id="reset-crop" class="text-button">Reset photo crop</button>` }
function storyPanel() {
  const s=story()!
  return `${field('Headline','story.title',s.title,{rows:2,placeholder:'A good story starts here'})}<div class="body-heading"><span>Story</span><div><button class="format-button" data-format="**" title="Bold selected text" aria-label="Bold selected text"><b>B</b></button><button class="format-button" data-format="_" title="Italic selected text" aria-label="Italic selected text"><i>I</i></button></div></div><textarea class="story-body" data-field="story.body" rows="8" aria-label="Story body" placeholder="Tell the story…">${escape(s.body)}</textarea><p class="field-note">Select words to add emphasis. Blank lines start a new paragraph.</p>${field('Instagram handle','story.handle',s.handle,{placeholder:'@thevenue',hint:'Two handles? Put a space between them and they stack in the footer.'})}${issue().series==='picks'?`<div class="field-pair">${field('Date','story.date',s.date,{placeholder:'6 Oct'})}${field('Time','story.time',s.time,{placeholder:'8:30pm'})}</div>${field('Venue','story.venue',s.venue,{placeholder:'Doyle’s Bar'})}`:'<p class="field-note">What’s New uses the handle-only footer. Event details stay saved if you switch series.</p>'}<div class="rule"></div>${heading('Photo',s.photo?'Drag it on the page to reframe':'A picture tells the story')}<button id="choose-photo" class="photo-upload">${s.photo?`<img src="${escape(s.photo)}" alt="Current story photo"><span>${icon('image')} Replace photo</span>`:`${icon('upload')} Choose a photo`}</button><label class="cover-eligibility"><input type="checkbox" data-field="story.coverEligible" ${s.coverEligible?'checked':''}> Offer this photo for the cover</label><p class="field-note">Turn off for posters and images with large text or graphics.</p>${cropControls('story',s.crop)}${designUnlocked()?`${range('Picture height','story.imageHeight',pictureHeight(s,library.brand),280,620,10,'px')}<p class="field-note">Or drag the picture’s bottom edge on the page.</p><button id="reset-layout" class="text-button">Use house picture height</button>`:`${range('Picture height','story.imageHeight',library.brand.imageHeight,280,620,10,'px',1,true)}<p class="field-note">Every page’s picture is the same height, so the story keeps to the room under it.</p>`}<div class="rule"></div><div class="page-actions"><button id="move-up" class="quiet" ${pageIndex()===1?'disabled':''}>${icon('up')} Up</button><button id="move-down" class="quiet" ${pageIndex()===issue().stories.length?'disabled':''}>${icon('down')} Down</button><button id="duplicate" class="quiet" title="Duplicate story" aria-label="Duplicate story">${icon('copy')}</button><button id="delete" class="quiet danger" title="Remove story" aria-label="Remove story" ${issue().stories.length===1?'disabled':''}>${icon('trash')}</button></div>`
}
function stylePanel() {
  const b=library.brand
  const colours = (keys: (keyof Brand)[],labels: string[]) => `<div class="swatches">${keys.map((k,i)=>`<label><input type="color" data-color="${k}" value="${b[k]}" aria-label="${labels[i]} colour"><span>${labels[i]}</span></label>`).join('')}</div>`
  return `<div class="style-note">One set of styles for both series. Changes apply to every guide saved in this browser.</div>
  ${heading('Inside pages')}${range('Story text size','brand.bodySize',b.bodySize,34,44,1,'px')}
  <label class="field"><span>Story text weight</span><select data-field="brand.bodyWeight" data-number="true"><option value="400" ${b.bodyWeight===400?'selected':''}>Regular</option><option value="500" ${b.bodyWeight===500?'selected':''}>Medium</option></select></label>
  ${range('Story line spacing','brand.lineHeight',b.lineHeight,1.15,1.4,.01,'×')}
  ${range('Story headline size','brand.titleSize',b.titleSize,45,90,1,'px')}
  ${range('Story headline weight','brand.titleWeight',b.titleWeight,141,188,1)}
  <p class="field-note">Fine-tune the weight from Bold (141) to Black (188). Starts at 168, the story-title weight every AD tool shares.</p>
  <button id="full-copy-preview" class="secondary">Make a full-pages preview</button><p class="field-note">Creates a separate copy with sample text running every page to its last line: one block on some pages, two paragraphs on others.</p>
  <div class="rule"></div>${heading('Cover typography')}
  ${range('Cover headline size','brand.coverSize',b.coverSize,150,220,1,'px')}
  ${range('Cover tracking','brand.coverTracking',b.coverTracking,-6,0,.1,'%')}
  ${range('Cover line height','brand.coverLineHeight',b.coverLineHeight,.75,1,.01,'%',100)}
  ${range('Supporting text size','brand.subtitleSize',b.subtitleSize,38,54,1,'px')}
  ${range('Date strip weight','brand.dateWeight',b.dateWeight,141,188,1)}
  <p class="field-note">Cover titles use Barlow Bold. The date strip is a tag: ExtraBold (166) capitals on clean-cut tape, like every AD tag.</p>
  <div class="rule"></div>${heading('Space & structure')}${range('Page margins','brand.margin',b.margin,44,76,2,'px')}${range('Picture height','brand.imageHeight',b.imageHeight,360,600,10,'px')}<p class="field-note">Every story’s picture. Pages can’t change it (with ?unlocked they can).</p>
  <div class="rule"></div>${heading('Brand palette')}${colours(['light','dark','yellow'],['Paper','Ink','Yellow'])}
  ${heading('Body text colours')}${colours(['lightBody','darkBody'],['On light pages','On dark pages'])}
  <p class="field-note">Preview and export use the same bundled Barlow fonts.</p><button id="reset-brand" class="secondary">Restore house defaults</button><div class="prototype-note">LOCAL PROTOTYPE<br>These controls don’t change the published Tape Type or Event-guide tools.</div>`
}

function bindShell() {
  get<HTMLInputElement>('issue-name').oninput = e => change('name',()=>{ issue().name=(e.target as HTMLInputElement).value })
  get('page-list').onclick = e => { const b=(e.target as HTMLElement).closest<HTMLElement>('[data-page]'); if (!b) return; selected=b.dataset.page!; overview=false; panel='edit'; historyKey=''; renderShell() }
  document.querySelectorAll<HTMLElement>('[data-series]').forEach(b=>b.onclick=()=>change('series',()=>switchSeries(issue(),b.dataset.series as Series),true))
  get('undo').onclick=()=>undo(-1); get('redo').onclick=()=>undo(1)
  get('overview').onclick=()=>{ overview=!overview; renderShell() }
  get('house-style').onclick=()=>{ panel=panel==='style'?'edit':'style'; renderShell() }
  get('close-style')?.addEventListener('click',()=>{panel='edit';renderShell()})
  get('add-page').onclick=()=>{
    if(issue().stories.length>=40) return toast('This guide already has 40 stories.',true)
    change('add',()=>{const s=blankStory();issue().stories.push(s);selected=s.id;panel='edit';overview=false},true)
  }
  get('library').onclick=openLibrary; get('import').onclick=openImport; get('backup').onclick=backup
  get('export').onclick=()=>exportPages(true);get('export-page').onclick=()=>exportPages(false)
  get<HTMLSelectElement>('export-scale').onchange=e=>{exportScale=Number((e.target as HTMLSelectElement).value)}
  get('inspector-fields').addEventListener('input',onField)
  document.querySelectorAll<HTMLButtonElement>('[data-choice]').forEach(button=>button.onclick=()=>{
    if(button.disabled)return
    const property=button.dataset.choice!, value=property==='layout'?Number(button.dataset.value):button.dataset.value
    if((issue().cover as any)[property]===value)return
    const fields=get('inspector-fields'),scroll=fields.scrollTop
    change('cover-'+property,()=>{(issue().cover as any)[property]=value},true)
    get('inspector-fields').scrollTop=scroll
  })
  document.querySelectorAll<HTMLElement>('[data-slot]').forEach(el=>el.onclick=()=>{coverSlot=Number(el.dataset.slot);renderShell()})
  get<HTMLSelectElement>('collage-source')?.addEventListener('change',e=>change('collage',()=>{const value=(e.target as HTMLSelectElement).value;if(value==='uploaded')return;issue().cover.slots[coverSlot]=value;issue().cover.photos[coverSlot]='';issue().cover.crops[coverSlot]=crop()},true))
  get('reset-crop')?.addEventListener('click',()=>change('reset-crop',()=>{if(selected==='cover')issue().cover.crops[coverSlot]=crop();else story()!.crop=crop()},true))
  get('reset-layout')?.addEventListener('click',()=>change('reset-layout',()=>{story()!.imageHeight=null},true))
  get('reset-brand')?.addEventListener('click',()=>change('reset-brand',()=>{library.brand=clone(BASE_BRAND)},true))
  get('upload-cover-photo')?.addEventListener('click',()=>get<HTMLInputElement>('cover-photo-file').click())
  get<HTMLInputElement>('cover-photo-file').onchange=async e=>{
    const file=(e.target as HTMLInputElement).files?.[0];if(!file)return
    const targetIssue=issue().id,slot=coverSlot
    try{
      const photo=await preparePhoto(file)
      if(issue().id!==targetIssue)return toast('Guide changed. Choose the photo again.',true)
      change('cover-upload',()=>{issue().cover.photos[slot]=photo;issue().cover.crops[slot]=crop()},true)
      toast(`Cover photo ${slot+1} saved.`)
    }catch(error){toast((error as Error).message,true)}
  }
  get('full-copy-preview')?.addEventListener('click',async()=>{
    await flushSave()
    const preview=clone(issue());preview.id=newId();preview.name='Type & spacing · full pages';preview.sample=true;preview.updated=new Date().toISOString()
    fillPreviewText(preview,library.brand)
    library.issues.push(preview);library.activeId=preview.id;selected=preview.stories[0].id;panel='edit';overview=false;resetHistory();markSave();renderShell()
    toast('Every page is filled to its last line. Your original guide is in My guides.')
  })
  get('choose-photo')?.addEventListener('click',()=>get<HTMLInputElement>('photo-file').click())
  get<HTMLInputElement>('photo-file').onchange=async e=>{
    const f=(e.target as HTMLInputElement).files?.[0];if(!f)return
    const targetId=selected,targetIssue=issue().id
    try { const data=await preparePhoto(f); if(issue().id!==targetIssue)return toast('Guide changed. Choose the photo again.',true); change('photo',()=>{const s=issue().stories.find(s=>s.id===targetId);if(s){s.photo=data;s.crop=crop();s.coverEligible=true}},true);toast('Photo saved with this guide.') } catch(err){toast((err as Error).message,true)}
  }
  get<HTMLInputElement>('restore-file').onchange=async e=>{
    const f=(e.target as HTMLInputElement).files?.[0];if(!f)return
    try {
      if(f.size>100*1024*1024)throw new Error('Choose a backup smaller than 100 MB.')
      const json=JSON.parse(await f.text())
      if(json.format!=='ad-guide-studio'||json.version!==1)throw new Error('Choose a Guide Studio backup.')
      const restored=sanitizeIssue(json.issue)
      get<HTMLDialogElement>('modal').close()
      modal('Restore your guide',`<p class="muted"><b>${escape(restored.name)}</b> contains ${restored.stories.length+1} pages. It will be added as a new guide; your other guides stay saved.</p><label class="restore-style"><input id="restore-style" type="checkbox" checked> Use the house style saved in this backup</label><p class="field-note">House styles apply to all guides in this browser. Uncheck this to use your current style.</p>`,`<button id="confirm-restore" class="primary">Restore guide</button>`)
      get('confirm-restore').onclick=()=>{if(get<HTMLInputElement>('restore-style').checked)library.brand=sanitizeBrand(json.brand);restored.id=newId();restored.name+=' · restored';library.issues.push(restored);library.activeId=restored.id;selected='cover';resetHistory();markSave();renderShell();toast('Backup restored as a new guide.')}
    }catch(err){toast((err as Error).message,true)}
  }
  get('move-up')?.addEventListener('click',()=>move(-1));get('move-down')?.addEventListener('click',()=>move(1))
  get('duplicate')?.addEventListener('click',()=>{if(issue().stories.length>=40)return toast('This guide already has 40 stories.',true);change('duplicate',()=>{const s={...clone(story()!),id:newId()};issue().stories.splice(pageIndex(),0,s);selected=s.id},true)})
  get('delete')?.addEventListener('click',()=>change('delete',()=>{const id=selected;issue().stories=issue().stories.filter(s=>s.id!==id);issue().cover.slots=issue().cover.slots.map(slot=>slot===id?issue().stories[0].id:slot);selected=issue().stories[0].id},true))
  document.querySelectorAll<HTMLElement>('[data-format]').forEach(b=>b.onmousedown=e=>e.preventDefault())
  document.querySelectorAll<HTMLElement>('[data-format]').forEach(b=>b.onclick=()=>{
    const text=document.querySelector<HTMLTextAreaElement>('[data-field="story.body"]')!,start=text.selectionStart,end=text.selectionEnd,mark=b.dataset.format!
    if(start===end)return toast('Select the words you want to emphasise first.')
    const value=text.value.slice(0,start)+mark+text.value.slice(start,end)+mark+text.value.slice(end)
    change('body-format',()=>{story()!.body=value});text.value=value;text.focus();text.setSelectionRange(start+mark.length,end+mark.length)
  })
  bindDrag(); bindBounds()
}
function move(dir: number){change('reorder',()=>{const i=pageIndex()-1,j=i+dir;if(j<0||j>=issue().stories.length)return;[issue().stories[i],issue().stories[j]]=[issue().stories[j],issue().stories[i]]},true)}
function onField(event: Event){
  const el=event.target as HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement
  if(el.disabled)return
  const key=el.dataset.field||el.dataset.range
  if(el.dataset.color){change('color-'+el.dataset.color,()=>{(library.brand as any)[el.dataset.color!]=el.value});return}
  if(!key)return
  if(el.dataset.range)el.parentElement!.querySelector('output')!.textContent=String(Math.round(Number(el.value)*Number(el.dataset.factor||1)*100)/100)+(el.dataset.suffix||'')
  change(key,()=>{
    const [target,property]=key.split('.'),value=el instanceof HTMLInputElement&&el.type==='checkbox'?el.checked:el.dataset.range||el.dataset.number?Number(el.value):el.value
    if(target==='brand')(library.brand as any)[property]=value
    else if(target==='cover'){if(['x','y','zoom'].includes(property))(issue().cover.crops[coverSlot] as any)[property]=value;else (issue().cover as any)[property]=value}
    else if(story()){if(['x','y','zoom'].includes(property))(story()!.crop as any)[property]=value;else (story() as any)[property]=value}
  })
  if(key==='story.coverEligible'&&!story()!.coverEligible){const remaining=issue().stories.filter(s=>s.coverEligible);issue().cover.slots=issue().cover.slots.map((id,i)=>id===selected?(remaining[i%remaining.length]?.id||''):id)}
  if(key==='story.title'){const card=document.querySelector(`[data-page="${selected}"] .page-card-title`);if(card)card.textContent=el.value||'Untitled story'}
}
/** The big canvas redraws on the next frame, so typing and dragging show straight away.
 *  A timer stands in for the frame when the tab is hidden, where frames never come. */
function scheduleRender(){
  if(drawFrame)return
  const run=()=>{if(!drawFrame)return;cancelAnimationFrame(drawFrame);clearTimeout(drawFallback);drawFrame=0;void drawAll()}
  drawFrame=requestAnimationFrame(run);drawFallback=window.setTimeout(run,100)
}
async function drawAll(){
  const token=++renderToken,snapshot=clone(issue()),brand=clone(library.brand),index=pageIndex()
  try{
    if(overview){
      const grid=get('overview-grid'),count=snapshot.stories.length+1
      // Rebuilt only when pages come or go, so the overview doesn't blank on every edit.
      if(grid.children.length!==count){
        grid.innerHTML=Array.from({length:count},(_,i)=>`<button class="overview-card" data-overview="${i}"><canvas></canvas><div><span>${i===0?'Cover':String(i).padStart(2,'0')}</span><span class="overview-state">Checking…</span></div></button>`).join('')
        grid.onclick=e=>{const b=(e.target as HTMLElement).closest<HTMLElement>('[data-overview]');if(b){const i=Number(b.dataset.overview);selected=i===0?'cover':issue().stories[i-1].id;overview=false;panel='edit';renderShell()}}
      }
      const results=await Promise.all([...grid.querySelectorAll<HTMLCanvasElement>('canvas')].map((c,i)=>renderPage(c,snapshot,i,brand,.35)))
      if(token!==renderToken)return
      results.forEach((r,i)=>{const label=grid.querySelectorAll('.overview-state')[i];label.textContent=r.errors.length?'Needs attention':'Ready';label.classList.toggle('invalid',!!r.errors.length)})
      currentErrors=results.flatMap(r=>r.errors);setFit(currentErrors.length?[`${results.filter(r=>r.errors.length).length} pages need attention. Select a page to fix it.`]:[])
    }else{
      const canvas=get<HTMLCanvasElement>('artboard'),stage=document.createElement('canvas')
      const result=await renderPage(stage,snapshot,index,brand,previewScale())
      if(token!==renderToken||!canvas.isConnected)return
      canvas.width=stage.width;canvas.height=stage.height;canvas.getContext('2d')!.drawImage(stage,0,0);currentErrors=result.errors;setFit(result.errors)
      shownPage=`${snapshot.id}:${index===0?'cover':snapshot.stories[index-1].id}`
      if(index===0){lastCoverBounds=result.background;lastHeadline=result.headline;lastBoundsKey=`${snapshot.id}:${snapshot.series}`;syncBounds()}
    }
  }catch(e){if(token===renderToken)setFit([(e as Error).message])}
  scheduleThumbs()
}
/** Thumbnails follow a moment behind: only stale ones, the page being edited first, none mid-drag. */
function scheduleThumbs(){clearTimeout(thumbTimer);thumbTimer=window.setTimeout(drawThumbs,dragging?400:150)}
async function drawThumbs(){
  if(dragging)return scheduleThumbs()
  const token=++thumbToken,snapshot=clone(issue()),brand=clone(library.brand),revision=String(contentRevision)
  const stale=[...document.querySelectorAll<HTMLCanvasElement>('[data-thumb]')].filter(c=>c.dataset.painted!==revision)
  stale.sort((a,b)=>Number(!!b.closest('.active'))-Number(!!a.closest('.active')))
  for(const c of stale){
    try{await renderPage(c,snapshot,Number(c.dataset.thumb),brand,.16)}catch{continue}
    if(token!==thumbToken)return
    c.dataset.painted=revision
  }
}
function setFit(errors:string[]){const el=get('fit-status');if(!el)return;el.className=errors.length?'needs-attention':'fits';el.innerHTML=`${icon(errors.length?'image':'check')}<span>${escape(errors[0]||'Everything fits. Ready when you are.')}</span>`;el.title=errors.join('\n')}

type Grab = { kind: 'photo'; slot: number; url: string; frame: { w: number; h: number } } | { kind: 'headline' } | { kind: 'edge' }
const inside = (b: CoverBounds | undefined, x: number, y: number, above = 0) => !!b && x >= b.x && x <= b.x + b.width && y >= b.y - above && y <= b.y + b.height
/** What sits under a point on the canvas: the cover headline, a photo to reframe, or an inside picture's bottom edge. */
function grabAt(x: number, y: number, slack: number): Grab | null {
  if (selected === 'cover') {
    // The words, their tape and the date strip above them move as one. In bounds mode the box has them.
    if (!boundsMode && (inside(lastCoverBounds, x, y) || inside(lastHeadline, x, y, 60))) return { kind: 'headline' }
    const frames = coverFrames(coverLook(issue(), designUnlocked()).count, issue().cover.orientation)
    const slot = frames.findIndex(f => x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h), url = slot < 0 ? '' : coverPhoto(issue(), slot)
    return url ? { kind: 'photo', slot, url, frame: frames[slot] } : null
  }
  const s = story()
  if (!s) return null
  const h = pictureHeight(s, library.brand)
  // The picture's height is the house's; only a design session (?unlocked) can drag it.
  if (designUnlocked() && Math.abs(y - h) <= slack) return { kind: 'edge' }
  return y < h && s.photo ? { kind: 'photo', slot: -1, url: s.photo, frame: { w: WIDTH, h } } : null
}
/** Moves a slider to follow a drag on the canvas, unless it's the one being dragged. */
function syncRange(key: string, value: number) {
  const input = document.querySelector<HTMLInputElement>(`[data-range="${key}"]`)
  if (!input || input === document.activeElement) return
  input.value = String(value)
  const output = input.parentElement?.querySelector('output')
  if (output) output.textContent = String(Math.round(value * Number(input.dataset.factor || 1) * 100) / 100) + (input.dataset.suffix || '')
}
/** The big canvas is drawn at the size it's shown, as Tape Type's preview is. A full 1080px page
 *  shrunk by the browser looks lighter than it is, worst on a 1x monitor. Exports stay full size. */
function previewScale(){
  const area=get('artboard-area');if(!area)return 1
  const style=getComputedStyle(area),w=area.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight),h=area.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom)
  const shown=Math.min(w,h*WIDTH/HEIGHT)
  return shown>0?Math.min(1,shown*devicePixelRatio/WIDTH):1
}
function bindDrag(){
  areaObserver?.disconnect()
  const area=get('artboard-area')
  if(area&&!overview){let drawn=0;areaObserver=new ResizeObserver(()=>{const now=Math.round(previewScale()*100);if(now!==drawn){drawn=now;scheduleRender()}});areaObserver.observe(area)}
  const canvas=get<HTMLCanvasElement>('artboard');if(!canvas)return
  const at=(e:PointerEvent)=>{const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*WIDTH/r.width,y:(e.clientY-r.top)*HEIGHT/r.height,slack:8*WIDTH/r.width}}
  const cursor={photo:'grab',headline:'ns-resize',edge:'ns-resize'}
  let drag:{grab:Grab;x:number;y:number;position:number;box:CoverBounds|null;height:number;crop:{x:number;y:number;zoom:number}}|null=null
  canvas.onpointerdown=e=>{
    const p=at(e),grab=grabAt(p.x,p.y,p.slack),c=issue().cover,s=story()
    if(!grab||(grab.kind==='photo'&&!loadedImage(grab.url)))return
    e.preventDefault();historyKey='';checkpoint('drag-'+grab.kind)
    const box=c.backgrounds[issue().series]
    drag={grab,x:p.x,y:p.y,position:c.position,box:box&&{...box},height:s?pictureHeight(s,library.brand):library.brand.imageHeight,crop:clone(grab.kind!=='photo'?crop():grab.slot<0?s!.crop:c.crops[grab.slot])}
    dragging=true;canvas.setPointerCapture(e.pointerId);canvas.style.cursor=grab.kind==='photo'?'grabbing':'ns-resize'
  }
  canvas.onpointermove=e=>{
    const p=at(e)
    if(!drag){const grab=grabAt(p.x,p.y,p.slack);canvas.style.cursor=grab?cursor[grab.kind]:'';return}
    const {grab}=drag,dx=p.x-drag.x,dy=p.y-drag.y,c=issue().cover,s=story()
    if(grab.kind==='headline'){
      // Same range as the slider. A custom tape box travels with the words.
      const room=HEIGHT-(lastHeadline?.height??600),position=Math.round(Math.max(30,Math.min(70,drag.position+dy/room*100))*10)/10
      c.position=position;syncRange('cover.position',position)
      if(drag.box)c.backgrounds[issue().series]=clampBounds({...drag.box,y:drag.box.y+room*(position-drag.position)/100})
    }else if(grab.kind==='edge'&&s){
      s.imageHeight=Math.max(280,Math.min(620,Math.round((drag.height+dy)/10)*10));syncRange('story.imageHeight',s.imageHeight)
    }else if(grab.kind==='photo'){
      const img=loadedImage(grab.url)!,view=dragPhoto(img.naturalWidth,img.naturalHeight,drag.crop,dx,dy,{width:grab.frame.w,height:grab.frame.h})
      if(grab.slot<0&&s)s.crop=view;else c.crops[grab.slot]=view
      if(grab.slot<0||grab.slot===coverSlot){const prefix=grab.slot<0?'story':'cover';syncRange(`${prefix}.x`,view.x);syncRange(`${prefix}.y`,view.y)}
    }
    issue().updated=new Date().toISOString();markSave();scheduleRender()
  }
  const end=()=>{
    if(!drag)return
    const {grab}=drag;drag=null;dragging=false;canvas.style.cursor='';historyKey='';updateHeader()
    // A photo reframed on the cover becomes the one the panel shows.
    if(grab.kind==='photo'&&grab.slot>=0&&grab.slot!==coverSlot){coverSlot=grab.slot;renderShell()}else scheduleThumbs()
  }
  canvas.onpointerup=end;canvas.onpointercancel=end
}

function modal(title:string,body:string,footer=''){
  const d=get<HTMLDialogElement>('modal');d.innerHTML=`<div class="modal-heading"><div><span class="eyebrow">GUIDE STUDIO</span><h2>${title}</h2></div><button id="modal-close" class="icon-button" aria-label="Close dialog">${icon('close')}</button></div><div class="modal-body">${body}</div>${footer?`<div class="modal-footer">${footer}</div>`:''}`
  d.showModal();get('modal-close').onclick=()=>d.close();d.onclick=e=>{if(e.target===d)d.close()}
}
function openLibrary(){
  modal('Your guides',`<p class="muted">Saved on this browser, including uploaded photos. Download a backup to move a guide to another computer.</p><div class="library-list">${library.issues.map(i=>`<button data-open="${escape(i.id)}"><span class="library-icon ${i.series}">${icon('file')}</span><span><strong>${escape(i.name)}</strong><small>${seriesName(i.series)} · ${i.stories.length+1} pages</small></span>${i.id===library.activeId?'<span class="in-use">OPEN</span>':icon('arrow')}</button>`).join('')}</div>`,`<button id="restore" class="quiet">${icon('upload')} Restore backup</button><button id="new-guide" class="primary">${icon('plus')} New guide</button>`)
  document.querySelectorAll<HTMLElement>('[data-open]').forEach(b=>b.onclick=async()=>{await flushSave();library.activeId=b.dataset.open!;selected='cover';overview=false;panel='edit';resetHistory();markSave();renderShell()})
  get('restore').onclick=()=>get<HTMLInputElement>('restore-file').click()
  get('new-guide').onclick=()=>{get<HTMLDialogElement>('modal').close();openNew()}
}
function openNew(){
  modal('Start a new guide',`<label class="field"><span>Guide name</span><input id="new-name" placeholder="This week’s picks"></label><label class="field"><span>Series</span><select id="new-series"><option value="picks">Event Guide Picks</option><option value="new">What’s New in Dublin</option></select></label><label class="restore-style"><input id="new-sample" type="checkbox"> Start from the sample pages</label><p class="muted">Your current guide stays saved in My guides.</p>`,`<button id="create-guide" class="primary">Create guide ${icon('arrow')}</button>`)
  get('create-guide').onclick=()=>{const sample=get<HTMLInputElement>('new-sample').checked,next=makeIssue(get<HTMLSelectElement>('new-series').value as Series,sample);next.name=get<HTMLInputElement>('new-name').value.trim()||(sample?'Sample guide':'Untitled guide');library.issues.push(next);library.activeId=next.id;selected='cover';get<HTMLDialogElement>('modal').close();resetHistory();markSave();renderShell()}
}
/** A guide doc as the team can start one: Import copy reads it as pasted from Google Docs (5 Oct 2026). */
const DOC_TEMPLATE=`Title: Pretty Good Improv x Failed State
Instagram: @the_pearse_centre
Date: 9 Oct
Time: 8pm
Venue: The Pearse Centre
Text:
Looking for a fun night of comedy in Dublin? Two of the city’s newest improv nights are joining forces for a special October show.

Doors open at 7:30pm and the show starts at 8pm. Grab your friends and see what happens when the performers make it all up on the spot!

Title: The next story’s title
Instagram: @theirhandle
Text:
The story goes here, about 500 characters. Leave an empty line between paragraphs.`
const IMPORT_EXAMPLE=DOC_TEMPLATE
/** How to lay out a guide doc so it comes in cleanly, in Import copy. */
const DOC_GUIDE=`<details class="sheet-guide"><summary>How to set up the doc</summary><ol>
<li><b>One guide per doc,</b> its stories in order. Picks can come from a doc like this, or straight from the events Sheet: tick TOP PICKS, write each pick’s text in a BLURB column, and load the Sheet’s link above. Tick TOP PICKS either way, so the website knows the picks.</li>
<li><b>The weekly What’s New doc works as it is:</b> the stories marked ✅ come in with their Text. 🟠, 🔴 and ❌ stories wait for the next paste, and Written by, Brief, Link and Newsletter Text stay out.</li>
<li><b>Each story starts with a Title: line,</b> then an Instagram: line, and Date:, Time: and Venue: lines if it’s an event. Leave out what a story doesn’t need.</li>
<li><b>Then Text:</b> and the story under it, 80 to 90 words, or about 80 under a headline that runs to three lines. Leave an empty line between paragraphs. Bold and italics from the doc don’t come through, so write <code>**bold**</code> and <code>_italic_</code>.</li>
<li><b>The next story starts at its own Title: line.</b> A line of dashes between stories works too.</li>
<li><b>Copy the whole doc</b> (⌘ or Ctrl + A, then C) and paste it below. Photos go in here, after.</li></ol>
<p><button id="copy-doc-template" class="text-button" type="button">Copy the template</button> <span id="copy-doc-status" class="copy-status" role="status" aria-live="polite"></span></p>
<textarea id="doc-template" class="template-source" readonly hidden aria-label="The doc template">${DOC_TEMPLATE}</textarea></details>`
/** How to lay out a Sheet so it comes in cleanly, in Import copy. */
const SHEET_GUIDE=`<details class="sheet-guide"><summary>How to set up the Sheet</summary><ol>
<li><b>Share it:</b> Share → General access → Anyone with the link → Viewer. The tool only reads it.</li>
<li><b>Row 1 names the columns,</b> then one story to a row. Nothing above row 1, and no merged cells.</li>
<li><b>The columns,</b> in any order:<ul>
<li><b>Title</b>: the page title, as it should read.</li>
<li><b>Text</b> (or Blurb): the story, about 500 characters. A line break in the cell (⌘ or Ctrl + Enter) starts a new paragraph; <code>**bold**</code> and <code>_italic_</code> work.</li>
<li><b>Instagram</b>: the handle, or a link to the profile. For two, put a space between them.</li>
<li><b>Date</b> and <b>Time</b>, as they should read: 9 Oct or 22–26 Oct, 8pm or 7:30pm. Set both columns to Plain text first (Format → Number → Plain text), so the Sheet keeps them as typed.</li>
<li><b>Venue</b>.</li></ul>Leave a cell empty when a story doesn’t need it: What’s New stories often have no date.</li>
<li><b>A tab a week:</b> duplicate last week’s tab, clear its rows, and paste the new tab’s link here. Each tab has its own link: open the tab and copy the address.</li>
<li><b>Photos</b> go in here, after loading.</li></ol>
<p><b>Picks from the events Sheet:</b> in a Picks guide, the events Sheet’s link brings in the rows with Approved and TOP PICKS ticked, with their names, dates, times, venues and handles. Add a BLURB column at the end of its tab for each pick’s text, about 500 characters; without one, the website’s short DESCRIPTION comes in as a start.</p></details>`
function openImport(){
  importResult=null
  const series=issue().series
  modal('From copy to carousel.',`<div class="section-heading"><h3>From a Google Sheet</h3></div><label class="field sheet-field"><span>Google Sheet link</span><span class="sheet-row"><input id="sheet-link" type="url" inputmode="url" spellcheck="false" autocomplete="off" placeholder="https://docs.google.com/spreadsheets/d/…" value="${escape(savedSheetLink(series))}"><button id="load-sheet" class="secondary" type="button">Load Sheet</button></span></label><p id="sheet-status" class="field-note sheet-status">Paste the link to this week’s tab, as in the event guide.</p>${SHEET_GUIDE}<div class="rule"></div><div class="section-heading"><h3>Or from your doc</h3></div><p class="muted">Copy the whole doc and paste it below. A CSV works too, the Sheet’s download (File → Download → CSV) among them.</p>${DOC_GUIDE}<div class="import-actions"><button id="use-example" class="text-button">Use an example</button><label class="text-button file-label">Choose CSV or text file<input id="import-file" type="file" accept=".txt,.csv,text/plain,text/csv" hidden></label></div><textarea id="import-text" rows="8" aria-label="Copy to import" placeholder="Title: Your first story&#10;Instagram: @thevenue&#10;Text:&#10;The story goes here…&#10;&#10;Title: Your next story"></textarea><div id="import-review"></div><label class="field"><span>Add the stories to</span><select id="import-target"><option value="new">A new ${seriesName(series)} guide</option><option value="current">This guide · keep existing pages</option></select></label>`,`<button id="review-import" class="primary">Review stories ${icon('arrow')}</button><button id="apply-import" class="primary" hidden>Add stories</button>`)
  const sheetStatus=(text:string,error=false)=>{const status=get('sheet-status');status.textContent=text;status.classList.toggle('error',error)}
  get('load-sheet').onclick=async()=>{
    const link=get<HTMLInputElement>('sheet-link').value,button=get<HTMLButtonElement>('load-sheet')
    try{
      const source=parseSheetLink(link)
      button.disabled=true;sheetStatus('Reading the Sheet…')
      const table=await loadSheet(source)
      saveSheetLink(series,link)
      importResult=parseImport(table,series)
      sheetStatus(`Read at ${new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}: ${table.rows.filter(row=>row.some(Boolean)).length} rows.`)
      showImportReview()
    }catch(e){invalidateImport();sheetStatus((e as Error).message,true)}
    finally{button.disabled=false}
  }
  get('sheet-link').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();get('load-sheet').click()}}
  get('use-example').onclick=()=>{get<HTMLTextAreaElement>('import-text').value=IMPORT_EXAMPLE;invalidateImport()}
  get('copy-doc-template').onclick=async()=>{const source=get<HTMLTextAreaElement>('doc-template'),status=get('copy-doc-status');try{await navigator.clipboard.writeText(source.value);status.textContent='Copied. Paste it into a new Google Doc.'}catch{source.hidden=false;source.focus();source.select();status.textContent='Selected below: press ⌘C or Ctrl+C to copy.'}}
  get<HTMLInputElement>('import-file').onchange=async e=>{const f=(e.target as HTMLInputElement).files?.[0];if(f){if(f.size>2*1024*1024)return toast('Choose a text file smaller than 2 MB.',true);get<HTMLTextAreaElement>('import-text').value=await f.text();invalidateImport()}}
  get('import-text').oninput=invalidateImport
  get('review-import').onclick=()=>{
    try{importResult=parseImport(get<HTMLTextAreaElement>('import-text').value,series);showImportReview()}catch(e){toast((e as Error).message,true)}
  }
  get('apply-import').onclick=()=>{
    if(!importResult)return
    const stories=clone(importResult.stories),target=get<HTMLSelectElement>('import-target').value
    if(target==='current'&&stories.length+issue().stories.length>40)return toast('A guide can hold up to 40 stories.',true)
    if(target==='new'){const next=makeIssue(issue().series);next.name='Imported guide';next.stories=stories;next.cover.slots=Array.from({length:4},(_,i)=>stories[i%stories.length].id);library.issues.push(next);library.activeId=next.id;resetHistory()}
    else{checkpoint('import');issue().stories.push(...stories)}
    selected=stories[0].id;overview=false;panel='edit';markSave();renderShell();toast(`${stories.length} editable stories added. Choose their photos next.`)
  }
}
/** What an import found, from a Sheet or from pasted copy, before anything is added. */
function showImportReview(){
  if(!importResult)return
  get('import-review').innerHTML=`<div class="review-box"><b>${importResult.stories.length} stories found</b><ol>${importResult.stories.map(s=>`<li>${escape(s.title||'Missing title')}<small>${s.body.length} characters</small></li>`).join('')}</ol>${importResult.warnings.map(w=>`<p>${escape(w)}</p>`).join('')}</div>`
  get<HTMLButtonElement>('apply-import').hidden=false;get<HTMLButtonElement>('apply-import').textContent=`Add ${importResult.stories.length} stories`;get<HTMLButtonElement>('review-import').hidden=true
  get('import-review').scrollIntoView({block:'nearest'})
}
function invalidateImport(){importResult=null;get('import-review').innerHTML='';get<HTMLButtonElement>('apply-import').hidden=true;get<HTMLButtonElement>('review-import').hidden=false}
function download(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.hidden=true;document.body.append(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),30000)}
const filename=()=>issue().name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'guide'
async function backup(){
  try{await flushSave();const out=clone(issue());for(const s of out.stories){if(s.photo.startsWith('/photos/')){const response=await fetch(asset(s.photo));if(!response.ok)throw new Error('A sample photo could not be included. Try again.');const blob=await response.blob();s.photo=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=reject;r.readAsDataURL(blob)})}}download(new Blob([JSON.stringify({format:'ad-guide-studio',version:1,issue:out,brand:library.brand})],{type:'application/json'}),`${filename()}.guide.json`);toast('Backup includes every page, photo and crop.')}catch(e){toast((e as Error).message,true)}
}
async function exportPages(all:boolean){
  if(busy)return
  busy=true;const snapshot=clone(issue()),brand=clone(library.brand),name=filename(),indices=all?Array.from({length:snapshot.stories.length+1},(_,i)=>i):[pageIndex()]
  const exportButton=get<HTMLButtonElement>(all?'export':'export-page');exportButton.disabled=true
  try{
    await loadFonts();await flushSave()
    const files:{name:string;bytes:Uint8Array}[]=[]
    for(const i of indices){
      exportButton.textContent=`Rendering ${files.length+1} / ${indices.length}…`
      const canvas=document.createElement('canvas'),result=await renderPage(canvas,snapshot,i,brand,exportScale)
      if(result.errors.length){selected=i===0?'cover':snapshot.stories[i-1].id;overview=false;panel='edit';renderShell();throw new Error(`${i===0?'Cover':`Story ${i}`}: ${result.errors[0]}`)}
      const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('PNG export failed.')),'image/png'))
      files.push({name:`${String(i+1).padStart(2,'0')}-${i===0?'cover':'story'}${exportScale===2?'@2x':''}.png`,bytes:new Uint8Array(await blob.arrayBuffer())})
    }
    download(all?zipFiles(files):new Blob([files[0].bytes],{type:'image/png'}),all?`${name}.zip`:`${name}-${files[0].name}`)
    toast(all?`${files.length} pages exported in order.`:'Page exported.')
  }catch(e){toast((e as Error).message,true)}finally{busy=false;if(exportButton.isConnected){exportButton.disabled=false;exportButton.innerHTML=icon('down')+(all?' Export guide':' Download this page')}}
}

// ↑ and ↓ step through the pages in the sidebar's order, unless the keys belong to what has focus:
// a field, a slider, a dialog, or the tape box, which takes them for nudging (and marks them handled).
document.addEventListener('keydown',e=>{
  if((e.key!=='ArrowUp'&&e.key!=='ArrowDown')||e.defaultPrevented||e.metaKey||e.ctrlKey||e.altKey||e.shiftKey)return
  const target=e.target as HTMLElement
  if(target.closest('input,textarea,select,[contenteditable="true"],dialog')||get<HTMLDialogElement>('modal')?.open||dragging)return
  const index=pageIndex(),next=Math.min(issue().stories.length,Math.max(0,index+(e.key==='ArrowDown'?1:-1)))
  e.preventDefault()
  if(next===index)return
  const fromList=!!target.closest('#page-list')
  selected=next===0?'cover':issue().stories[next-1].id;overview=false;panel='edit';historyKey='';renderShell()
  const card=get('page-list').querySelector<HTMLElement>('.page-card.active')
  card?.scrollIntoView({block:'nearest'})
  if(fromList)card?.focus({preventScroll:true})
})
document.addEventListener('keydown',e=>{
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'&&!['INPUT','TEXTAREA'].includes((e.target as HTMLElement).tagName)){e.preventDefault();undo(e.shiftKey?1:-1)}
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'){e.preventDefault();flushSave()}
})
window.addEventListener('beforeunload',e=>{if(saving||saveFailed){e.preventDefault();e.returnValue=''}})
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&saving)flushSave()})
async function boot(){
  app.innerHTML='<div class="loading"><span class="brand-mark">a/d</span><h1>Guide Studio</h1><p>Getting your pages ready…</p></div>'
  try{
    const stored=await readLibrary()
    await loadFonts()
    if(stored&&stored.issues.length){library=stored;if(!library.issues.some(i=>i.id===library.activeId))library.activeId=library.issues[0].id}
    else{const sample=makeIssue('picks',true);library={version:1,activeId:sample.id,issues:[sample],brand:clone(BASE_BRAND)}}
    renderShell();if(!stored)markSave()
  }catch(e){app.innerHTML=`<div class="loading"><h1>Your work is safe.</h1><p>${escape((e as Error).message)}</p><p>The existing saved library has not been overwritten.</p><button class="primary" onclick="location.reload()">Try again</button></div>`}
}
boot()
