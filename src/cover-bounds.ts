export type CoverBounds = { x: number; y: number; width: number; height: number }
const clamp = (n: number, min: number, max: number) => Math.max(min,Math.min(max,n))
export function clampBounds(box: CoverBounds): CoverBounds {
  const width=clamp(Math.round(box.width),100,1080),height=clamp(Math.round(box.height),100,1350)
  return {x:clamp(Math.round(box.x),0,1080-width),y:clamp(Math.round(box.y),0,1350-height),width,height}
}
/** Resize from a fixed opposite edge, or move the entire background without altering its size. */
export function dragBounds(start: CoverBounds, handle: string, dx: number, dy: number): CoverBounds {
  if(handle==='move')return clampBounds({...start,x:start.x+dx,y:start.y+dy})
  let left=start.x,right=start.x+start.width,top=start.y,bottom=start.y+start.height
  if(handle.includes('w'))left=clamp(left+dx,0,right-100)
  if(handle.includes('e'))right=clamp(right+dx,left+100,1080)
  if(handle.includes('n'))top=clamp(top+dy,0,bottom-100)
  if(handle.includes('s'))bottom=clamp(bottom+dy,top+100,1350)
  return clampBounds({x:left,y:top,width:right-left,height:bottom-top})
}
export function readBounds(value: unknown): CoverBounds | null {
  if(!value||typeof value!=='object')return null
  const box=value as CoverBounds
  if(![box.x,box.y,box.width,box.height].every(n=>typeof n==='number'&&Number.isFinite(n)))return null
  return clampBounds(box)
}
