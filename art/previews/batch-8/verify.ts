import { ASSETS } from '../../../packages/shared/src/assets.ts';
import { readPng, at } from '../../../tools/pixelize/src/image.ts';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

process.chdir(resolve(import.meta.dirname, '../../..'));
const checks = [];
for (const a of ASSETS.filter(a => a.batch === 8)) {
  const args = ['pixelize', 'check', `assets/${a.file}`, '--palette', a.palette, '--size', `${a.width*a.frames}x${a.height}`];
  const result = spawnSync('pnpm', args, { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr + result.stdout);
  const im = readPng(`assets/${a.file}`);
  const frames = [];
  for (let f=0;f<a.frames;f++) {
    const bytes=[];
    let solid=0;
    for(let y=0;y<a.height;y++)for(let x=0;x<a.width;x++) {
      const i=at(im,f*a.width+x,y);
      bytes.push(...im.data.subarray(i,i+4));
      if(im.data[i+3])solid++;
    }
    assert(solid>0,`${a.id} frame ${f+1} is empty`);
    frames.push({ solidPixels:solid, sha256:createHash('sha256').update(new Uint8Array(bytes)).digest('hex') });
  }
  if(a.frames>1)assert(new Set(frames.map(f=>f.sha256)).size>=3,`${a.id}: insufficient distinct animation phases`);
  if(a.id.startsWith('fx.headphones_')) {
    const neutral=new Set(['2b2238','5a5670','7f7c97','a9a8be','d3d3e0','f4f2ee']);
    for(let i=0;i<im.data.length;i+=4)if(im.data[i+3])assert(neutral.has(Array.from(im.data.subarray(i,i+3)).map(v=>v.toString(16).padStart(2,'0')).join('')),`${a.id}: appearance-swap colour`);
  }
  checks.push({id:a.id,size:[im.width,im.height],palette:a.palette,pixelizeCheck:'passed',frames});
}

// Run the generated inventory as requested, then restore its exact original
// bytes: this batch deliberately does not commit ASSETS.md or manifest.json.
const paths=['art/ASSETS.md','assets/manifest.json'];
const original=paths.map(path=>readFileSync(path));
try {
  const result=spawnSync('pnpm',['assets:status'],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr+result.stdout);
  console.log(result.stdout.trim());
} finally {
  paths.forEach((path,i)=>writeFileSync(path,original[i]!));
}
paths.forEach((path,i)=>assert.deepEqual(readFileSync(path),original[i]));
writeFileSync('art/previews/batch-8/checks.json',JSON.stringify({assetCount:checks.length,protectedFilesPreserved:true,checks},null,2)+'\n');
console.log('24 pixelize checks passed; all frames nonempty; headphone colours neutral; generated inventories restored byte-for-byte.');
