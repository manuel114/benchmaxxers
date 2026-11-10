import { ASSETS } from '../../../packages/shared/src/assets.ts';
import { loadPalette } from '../../../tools/pixelize/src/palette.ts';
import { toIndexed } from '../../../tools/pixelize/src/pixelize.ts';
import { readPng, writePng, blank, at, type Image } from '../../../tools/pixelize/src/image.ts';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
process.chdir(root);
const magenta = (im: Image, x: number, y: number) => {
  const i = at(im, x, y), [r,g,b,a] = im.data.subarray(i,i+4);
  return a! < 128 || (r! > 170 && b! > 170 && g! < 110 && Math.abs(r!-b!) < 90);
};
type Rect = {x:number;y:number;w:number;h:number};
function bounds(im:Image, x0=0, x1=im.width):Rect {
  let l=im.width,t=im.height,r=-1,b=-1;
  for(let y=0;y<im.height;y++) for(let x=x0;x<x1;x++) if(!magenta(im,x,y)) {l=Math.min(l,x);t=Math.min(t,y);r=Math.max(r,x);b=Math.max(b,y);}
  if(r<0) throw Error('Empty image');
  return {x:l,y:t,w:r-l+1,h:b-t+1};
}
function sample(im:Image,r:Rect,w:number,h:number):Image {
  const out=blank(w,h);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
    // Centre-of-cell samples avoid the model's soft raster boundaries.
    const sx=Math.min(im.width-1,Math.floor(r.x+(x+.5)*r.w/w));
    const sy=Math.min(im.height-1,Math.floor(r.y+(y+.5)*r.h/h));
    const i=at(out,x,y);
    if(magenta(im,sx,sy)) out.data.set([255,0,255,255],i);
    else {const j=at(im,sx,sy);out.data.set(im.data.subarray(j,j+3),i);out.data[i+3]=255;}
  }
  return out;
}
function paste(dst:Image,src:Image,x0:number,y0:number) {
  for(let y=0;y<src.height;y++) for(let x=0;x<src.width;x++) {
    const dx=x+x0,dy=y+y0;
    if(dx>=0&&dy>=0&&dx<dst.width&&dy<dst.height) dst.data.set(src.data.subarray(at(src,x,y),at(src,x,y)+4),at(dst,dx,dy));
  }
}
function large(im:Image):Image {
  const out=blank(im.width*8,im.height*8);
  for(let y=0;y<out.height;y++) for(let x=0;x<out.width;x++) out.data.set(im.data.subarray(at(im,Math.floor(x/8),Math.floor(y/8)),at(im,Math.floor(x/8),Math.floor(y/8))+4),at(out,x,y));
  return out;
}
function pink(w:number,h:number):Image {const out=blank(w,h);for(let i=0;i<out.data.length;i+=4)out.data.set([255,0,255,255],i);return out;}
mkdirSync('art/raw/batch-8/registered',{recursive:true});
const audit:any[]=[];
for(const a of ASSETS.filter(a=>a.batch===8)) {
  const src=readPng(`art/raw/batch-8/${a.id}.png`);
  let native:Image, boxes:Rect[]=[];
  if(a.frames>1) {
    boxes=Array.from({length:a.frames},(_,i)=>bounds(src,Math.floor(src.width*i/a.frames),Math.floor(src.width*(i+1)/a.frames)));
    const top=Math.min(...boxes.map(b=>b.y)),bottom=Math.max(...boxes.map(b=>b.y+b.h));
    const factor=Math.max(...boxes.map(b=>b.w/(a.width-4)),(bottom-top)/(a.height-2));
    // Wide gutters make detached stars/notes unambiguous to strip's frame finder.
    const gutter=48;native=pink(a.frames*(a.width+gutter),a.height);
    boxes.forEach((b,i)=>{
      const w=Math.max(1,Math.round(b.w/factor)),h=Math.max(1,Math.round(b.h/factor));
      const x=i*(a.width+gutter)+Math.floor((a.width-w)/2);
      const y=a.id==='fx.sweat'?[3,5,7,9][i]!:a.id==='fx.notes'?[5,3,1,0][i]!:Math.round((b.y-top)/factor)+1;
      paste(native,sample(src,b,w,h),x,y);
    });
    if(a.id==='fx.dust') {
      const b=bounds(native),shift=a.height-b.y-b.h,moved=pink(native.width,native.height);
      paste(moved,native,0,shift);native=moved;
    }
  } else {
    const b=bounds(src);let w=a.width,h=a.height;
    if(a.id.startsWith('ui.icon_')) {const k=Math.max(b.w/14,b.h/14);w=Math.round(b.w/k);h=Math.round(b.h/k);}
    if(a.id==='fx.headphones_side'){w=12;h=12;}
    native=sample(src,b,w,h);
  }
  const registered=`art/raw/batch-8/registered/${a.id}.png`;
  // Headphones must never acquire appearance-swap pixels when raster colours
  // drift toward hair or clothing ramps. Snap their source to neutral metals.
  if(a.id.startsWith('fx.headphones_')) {
    const neutral=['2B2238','5A5670','7F7C97','A9A8BE','D3D3E0','F4F2EE'].map(h=>[0,2,4].map(n=>parseInt(h.slice(n,n+2),16)));
    for(let y=0;y<native.height;y++)for(let x=0;x<native.width;x++)if(!magenta(native,x,y)){
      const i=at(native,x,y),rgb=Array.from(native.data.subarray(i,i+3));
      const distance=(c:number[])=>c.reduce((sum,v,k)=>sum+(v-rgb[k]!)**2,0);
      const best=neutral.reduce((best,c)=>distance(c)<distance(best)?c:best);
      native.data.set(best,i);
    }
  }
  writePng(registered,large(native));
  const args=['pixelize',a.kind,registered,...(a.frames>1?['--frames',String(a.frames),'--frame',`${a.width}x${a.height}`,'--anchor',a.anchor.join(',')]:['--size',`${a.width}x${a.height}`]),'--scale','8','--palette',a.palette,'--out',`assets/${a.file}`];
  const result=spawnSync('pnpm',args,{encoding:'utf8'});
  if(result.status!==0)throw Error(result.stderr||result.stdout);
  // Restore source-relative movement after the cleaner's bottom/centre registration.
  // Single UI pieces fill their exact cells; icons are centred vertically.
  const clean=readPng(`assets/${a.file}`),fixed=blank(clean.width,clean.height);
  if(a.frames>1) {
    for(let i=0;i<a.frames;i++){
      const target=bounds(native,i*(a.width+48),i*(a.width+48)+a.width);
      const cb=bounds(clean,i*a.width,(i+1)*a.width);
      const expectedX=target.x-i*(a.width+48),expectedY=target.y;
      const frame=blank(cb.w,cb.h);
      for(let y=0;y<cb.h;y++)for(let x=0;x<cb.w;x++)frame.data.set(clean.data.subarray(at(clean,cb.x+x,cb.y+y),at(clean,cb.x+x,cb.y+y)+4),at(frame,x,y));
      paste(fixed,frame,i*a.width+expectedX,expectedY);
    }
  } else if(a.id.startsWith('ui.icon_')) {
    paste(fixed,clean,0,-Math.floor((a.height-native.height)/2));
  } else paste(fixed,clean,0,0);
  let registrationMismatches=0;
  if(a.frames>1) {
    const palette=loadPalette(a.palette),indexed=toIndexed(native,palette,true);
    for(let f=0;f<a.frames;f++)for(let y=0;y<a.height;y++)for(let x=0;x<a.width;x++){
      const v=indexed.idx[y*native.width+f*(a.width+48)+x]!,i=at(fixed,f*a.width+x,y);
      const expected=v<0?[0,0,0,0]:[...palette[v]!,255];
      if(fixed.data[i+3]!==expected[3]||(expected[3]&&expected.some((c,k)=>c!==fixed.data[i+k])))registrationMismatches++;
    }
    if(registrationMismatches)throw Error(`${a.id}: ${registrationMismatches} pixels changed during strip registration`);
  }
  writePng(`assets/${a.file}`,fixed);
  audit.push({id:a.id,sourceSize:[src.width,src.height],registeredSize:[native.width,native.height],command:['pnpm',...args].join(' '),registrationMismatches,warnings:result.stderr.trim().split('\n').filter(Boolean)});
}
writeFileSync('art/previews/batch-8/cleanup.json',JSON.stringify(audit,null,2)+'\n');
console.log('Cleaned 24 sprites with explicit 8-pixel registered grid.');
