// Rebuild the six-look concept from canonical source pixels and saved choices.
// Shapes come from combined-source.png; this script only applies runtime colors.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { APPEARANCE_CHOICES, parseAppearancePatch, recolorCharacterPixels } from '../../packages/shared/src/appearance.ts';
import { blank, readPng, writePng } from '../../tools/pixelize/src/image.ts';

const path = (name) => fileURLToPath(new URL(name, import.meta.url));
const { columns, looks } = JSON.parse(readFileSync(path('./combined-looks.json'), 'utf8'));
const source = readPng(path('./combined-source.png'));
assert.equal(columns, 3);
assert.equal(looks.length, 6);
assert.equal(new Set(looks.map((look) => look.id)).size, looks.length);
assert.equal(source.width, 256);
assert.equal(source.height, 256);
const output = blank(source.width, source.height);
const rows = looks.length / columns;

for (const [n, look] of looks.entries()) {
  const appearance = parseAppearancePatch(look.appearance);
  assert.ok(Object.keys(APPEARANCE_CHOICES).every((part) => Object.hasOwn(appearance, part)), `${look.id}: incomplete appearance`);
  const col = n % columns, row = Math.floor(n / columns);
  const x0 = Math.floor(col * source.width / columns), x1 = Math.floor((col + 1) * source.width / columns);
  const y0 = Math.floor(row * source.height / rows), y1 = Math.floor((row + 1) * source.height / rows);
  const cell = blank(x1 - x0, y1 - y0);
  for (let y = 0; y < cell.height; y++) {
    const start = ((y0 + y) * source.width + x0) * 4;
    cell.data.set(source.data.subarray(start, start + cell.width * 4), y * cell.width * 4);
  }
  const colored = recolorCharacterPixels(cell.data, appearance);
  for (let i = 0; i < colored.length; i += 4) {
    assert.ok(colored[i + 3] === 0 || colored[i + 3] === 255, 'Non-binary alpha');
    assert.equal(colored[i + 3], cell.data[i + 3], 'Changed alpha');
    if (cell.data[i] === 43 && cell.data[i + 1] === 34 && cell.data[i + 2] === 56) {
      assert.deepEqual([...colored.subarray(i, i + 3)], [43, 34, 56], 'Changed ink');
    }
  }
  for (let y = 0; y < cell.height; y++) {
    output.data.set(colored.subarray(y * cell.width * 4, (y + 1) * cell.width * 4), ((y0 + y) * output.width + x0) * 4);
  }
}
writePng(path('./combined-looks.png'), output);

const preview = blank(output.width * 2, output.height * 2);
for (let y = 0; y < preview.height; y++) for (let x = 0; x < preview.width; x++) {
  const start = (Math.floor(y / 2) * output.width + Math.floor(x / 2)) * 4;
  preview.data.set(output.data.subarray(start, start + 4), (y * preview.width + x) * 4);
}
writePng(path('./combined-looks@2x.png'), preview);
assert.deepEqual(readPng(path('./combined-looks.png')).data, output.data);
assert.deepEqual(readPng(path('./combined-looks@2x.png')).data, preview.data);
console.log('Rendered 6 validated appearances with runtime palette swaps; binary alpha, ink, PNG round-trips and exact 2x preview verified.');
