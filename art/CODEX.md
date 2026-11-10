# Making the art with Codex (or any image model)

This is the step-by-step for producing the game's images in batches. Read [`STYLE.md`](STYLE.md) first. The full list of images, with sizes and what to draw, is [`ASSETS.md`](ASSETS.md) (generated from `packages/shared/src/assets.ts`).

## Why the extra steps

Image models draw "pixel art" that isn't on a real grid: pixels come out as 7, 8 or 9 screen pixels wide, colours drift, and backgrounds get soft. The game needs exact grids and exact colours. So every image goes through the same loop:

1. **Generate big** on a flat magenta (`#FF00FF`) background, where each art pixel is drawn as a 12 × 12 block.
2. **Save the raw file** to `art/raw/batch-<n>/<asset id>.png` (local work, not committed), or, for a cloud task that can't see your computer, upload it to [`art/inbox/`](inbox/) as `<asset id>.png`.
3. **Clean it** with `pnpm pixelize`, which removes the magenta, snaps to the grid, snaps every colour to the palette, and places frames in their cells.
4. **Check it** at 2× zoom next to the style tile. Redo anything that doesn't fit.
5. **Commit** only the cleaned file in `assets/`, then run `pnpm assets:status` to tick it off.

## Rules for every request

- Attach `art/reference/style-tile.png` once it exists (from batch 2 onwards).
- For characters, also attach `art/reference/character-build-1.png` once it exists.
- Ask for **one asset per image** (one animation strip, one prop, one tile).
- Paste the palette hex codes into the prompt (lists below).
- Never ask for text in an image, except the logo.

## Prompt template

Fill in the parts in angle brackets. The brief, size and frame count for each asset are in `ASSETS.md`.

```text
Pixel art game asset for "Benchmaxxers", a cosy, cute hi-bit pixel art gym game in three-quarter top-down view, light from the top left.

Draw: <brief from ASSETS.md>.

Format:
- <For animations: "<frames> animation frames of the same subject, side by side in one row, evenly spaced, each frame <width> x <height> art pixels."> <For stills: "One image, <width> x <height> art pixels.">
- This is 16-bit pixel art: few, big pixels. Every art pixel is a crisp square block exactly 12 x 12 image pixels (6 x 6 for anything wider than 128 art pixels). Hard edges only. No anti-aliasing, no blur, no gradients, no soft shadows, no texture noise.
- Flat solid #FF00FF magenta background everywhere that is not the subject. No floor, no shadow, no frame, no grid lines, no text.
- 1-pixel outline in #2B2238 around the subject. Shade with 3 flat tones per material.
- Use ONLY these colours: <paste the palette list for this asset>.
<For characters: "- Chunky cute proportions in a tiny 16 x 24 sprite: head about one third of the body height, 1x2-pixel eyes, 1-pixel blush cheeks. Short hair inside the head shape, a yellow headband, a green wristband on each wrist.">
<For animations: "- Keep the head the same size and position in every frame; only move what the animation needs, by 1 pixel. Feet stay on the same line.">

Match the attached reference images exactly in style, outline, colours and proportions.
```

### Character palette (paste into character prompts)

```text
#2B2238 ink, #F4F2EE cream, #F2A0A8 blush,
#5A5670 #7F7C97 #A9A8BE #D3D3E0 metal (barbell, bottle only),
#7A4B30 #B97A52 #E8B48C skin (skin only),
#33201A #54362A #7A5540 hair (hair only),
#17506E #2479A3 #63B9E0 shirt (shirt only),
#22243A #363959 #53578A shorts (shorts only),
#A3313E #D5525C #F0959C shoes (shoes only),
#D19A00 #FFCF3A headband (headband only),
#0E8F6D #47CFA2 wristbands (wristbands only)
```

### Environment palette (paste into everything else)

```text
#2B2238 #3E3450 ink and shadow,
#5A5670 #7F7C97 #A9A8BE #D3D3E0 #F4F2EE greys and cream,
#5E3826 #8A5636 #B9814F #E0AE78 wood,
#262E3B #36425A #4E5E7A rubber floor,
#7E2A36 #B8414B #E8706A red, #A84F26 #E0813A #F5B062 orange, #B98B25 #EDC549 #FBE5A1 yellow,
#2A5F47 #46996A #86CB97 #CDEDD3 green, #1C555C #2A8188 #57BAB7 teal,
#283A73 #3B67B8 #78ACE3 #C5DFF8 blue, #452A63 #70489A #AE85D2 purple, #9B4067 #DB759B #F5B6CD pink
```

## Cleanup commands

```bash
# An animation strip: finds each frame, snaps it, places it in its cell with the feet on the right line.
pnpm pixelize strip art/raw/batch-2/char.build-1.walk_down.png --frames 4 --frame 16x24 --palette character --out assets/characters/build-1/walk_down.png

# A still prop or UI piece: snaps it and places it bottom-centre in a canvas of the given size.
pnpm pixelize sprite art/raw/batch-5/prop.bench_back.png --size 32x24 --palette environment --out assets/props/bench_back.png

# A floor or wall tile that fills the whole image.
pnpm pixelize tile art/raw/batch-4/tile.floor_rubber_1.png --size 16x16 --palette environment --out assets/tiles/floor_rubber_1.png

# Check a finished file: size, transparency, palette.
pnpm pixelize check assets/props/bench_back.png --palette environment

# Tick off what exists and rebuild ASSETS.md and assets/manifest.json.
pnpm assets:status
```

If the tool guesses the pixel size wrong (the result looks doubled or mushy), pass it yourself with `--scale 12`.

## Batches

Do them in order. Each batch should be approved before the next starts, because later batches copy its look.

| Batch | What | Why this order |
| --- | --- | --- |
| 1 | **Style tile**: one small gym corner with floor, wall, window, a bench, a plant and the Toned agent | Locks the look. Save the approved one as `art/reference/style-tile.png` |
| 2 | **Toned agent** (build 1): a single standing frame first, then idle and walk in 3 directions | Becomes the character reference. Save the approved single frame as `art/reference/character-build-1.png` |
| 3 | **Other builds** (Noodle, Buff, Maxxed): single frame each first, then idle and walk | Same face and head, different bodies |
| 4 | **Floors and walls** | Seamless tiles are easier once the colours are settled |
| 5 | **Props and machines**: front desk, lockers, water cooler, plants, wall decor, bench, treadmill, yoga mats | Bench and treadmill come in back and front layers |
| 6 | **On-machine animations**: bench press, dropping the bar, running, 3 yoga poses. Toned first, then the others | Must line up with the bench, treadmill and mats from batch 5 |
| 7 | **Waiting and celebrating**: check watch, sip water, stretch, fist pump, for all 4 builds | |
| 8 | **Effects and UI**: sweat, cheer burst, dust, sparkle, music notes, headphones, speech bubbles, name tag, line badge, progress bar, icons | |
| 9 | **Mark the front-desk staff member and the brand**: logo, app icon, recap card background | |

Assets marked `later` in `ASSETS.md` (squat rack, leg press, rower, sparring ring) are not needed for the first version.

## Checklist before committing an image

- [ ] Looks like it belongs next to the style tile at 4× zoom.
- [ ] `pnpm pixelize check` passes: right size, only palette colours, no half-transparent pixels.
- [ ] Characters: feet on the same line in every frame, head the same size, swap colours only on their own body part.
- [ ] Side-view sprites face right and have nothing that looks wrong when mirrored.
- [ ] No text, no magenta left anywhere.
