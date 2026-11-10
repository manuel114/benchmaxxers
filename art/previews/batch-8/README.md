# Batch 8: effects and UI

Adds all 24 `fx.*` and `ui.*` assets from the batch 8 inventory: five four-frame strips and 19 stills, 39 frames total. Sizes, frame counts, FPS, asset definitions and palettes are unchanged. `art/ASSETS.md` and `assets/manifest.json` are deliberately excluded.

Every source was generated separately with the built-in image tool, a solid #FF00FF background and the approved style tile attached. The headphone requests also attached the approved Toned character and the corresponding existing idle strip. [Exact prompts](prompts.json). Originals remain in ignored `art/raw/batch-8/<asset id>.png`.

## Every new asset next to the style tile at 2×

![All 24 assets with the approved style tile at 2×](all-assets.with-style@2x.png)

| Approved reference | Room context |
| --- | --- |
| ![Approved style tile at 2×](style-tile@2x.png) | ![All effects in the gym at 2×](room.all-effects@2x.png) |

[Animated room at 2×](room.all-effects@2x.gif). Room composites use the existing floor, wall, props and characters with the same layout and sprite anchors as `GymRenderer`; these are art-review composites, not browser screenshots.

## Every effect in the gym at 2×

Each PNG presents all four phases in room context. GIFs loop at the asset's intended rate, rounded to GIF's 10ms timing increments. Actors are held still to isolate the effect.

| Effect | Four frames in room | Loop |
| --- | --- | --- |
| `fx.sweat` | ![sweat frames in gym at 2×](sweat.in-room@2x.png) | ![sweat loop in gym at 2×](sweat.in-room@2x.gif) |
| `fx.cheer` | ![cheer frames in gym at 2×](cheer.in-room@2x.png) | ![cheer loop in gym at 2×](cheer.in-room@2x.gif) |
| `fx.dust` | ![dust frames in gym at 2×](dust.in-room@2x.png) | ![dust loop in gym at 2×](dust.in-room@2x.gif) |
| `fx.sparkle` | ![sparkle frames in gym at 2×](sparkle.in-room@2x.png) | ![sparkle loop in gym at 2×](sparkle.in-room@2x.gif) |
| `fx.notes` | ![notes frames in gym at 2×](notes.in-room@2x.png) | ![notes loop in gym at 2×](notes.in-room@2x.gif) |

| Headphone view | In the gym at 2× |
| --- | --- |
| `fx.headphones_down` | ![Headphones down in gym at 2×](headphones_down.in-room@2x.png) |
| `fx.headphones_up` | ![Headphones up in gym at 2×](headphones_up.in-room@2x.png) |
| `fx.headphones_side` | ![Headphones side in gym at 2×](headphones_side.in-room@2x.png) |

## Headphone registration

All three overlays are 20×12 and use only neutral ink/metal/cream entries from the character palette. No skin, hair, garment, headband or wristband swap colour occurs in them. They use the existing renderer placement: top-left **(6,9)** relative to a 32×48 idle frame, from the headphones' (10,11) anchor at character floor point minus 26 pixels. The side view is mirrored for left.

All four builds and all four idle frames are included below; the animation checks the accessory through the breathing cycle.

![Headphones on all builds, down/up/right/left, at 2×](headphones.all-builds@2x.png)

![Headphones on all builds through all idle frames at 2×](headphones.all-builds@2x.gif)

## UI at several sizes

All previews below are exported at 2×. The labels give the underlying art-pixel dimensions. The bubble, whisper, shout, name tag and progress frame use 9-slice scaling. Icons, tail and badge show integer nearest-neighbour size variants; the fill stretches in both directions.

| Asset | Fixed left/right caps | Fixed top/bottom caps | Plain centre |
| --- | --- | --- | --- |
| bubble | 8 | 8 | cream |
| bubble_whisper | 8 | 8 | cream |
| bubble_shout | 8 | 8 | yellow |
| name_tag | 4 | 4 | ink |
| progress_frame | 8 | 2 | transparent |

The small 16×12 name tag and 24×8 progress frame require smaller vertical caps to leave a stretchable centre. Every corner stays within the outer eight pixels. Whisper edge strips repeat their dotted pattern while the centre stretches. All four corner regions are checked byte-for-byte at every preview size; each source centre is one flat colour or fully transparent. The tail's open cream top joins the regular bubble without a dark seam.

| UI asset | Several sizes, displayed at 2× |
| --- | --- |
| `ui.bubble` | ![bubble at several sizes at 2×](bubble.stretched@2x.png) |
| `ui.bubble_tail` | ![bubble_tail at several sizes at 2×](bubble_tail.stretched@2x.png) |
| `ui.bubble_whisper` | ![bubble_whisper at several sizes at 2×](bubble_whisper.stretched@2x.png) |
| `ui.bubble_shout` | ![bubble_shout at several sizes at 2×](bubble_shout.stretched@2x.png) |
| `ui.name_tag` | ![name_tag at several sizes at 2×](name_tag.stretched@2x.png) |
| `ui.line_badge` | ![line_badge at several sizes at 2×](line_badge.stretched@2x.png) |
| `ui.progress_frame` | ![progress_frame at several sizes at 2×](progress_frame.stretched@2x.png) |
| `ui.progress_fill` | ![progress_fill at several sizes at 2×](progress_fill.stretched@2x.png) |
| `ui.icon_headphones` | ![icon_headphones at several sizes at 2×](icon_headphones.stretched@2x.png) |
| `ui.icon_note` | ![icon_note at several sizes at 2×](icon_note.stretched@2x.png) |
| `ui.icon_dumbbell` | ![icon_dumbbell at several sizes at 2×](icon_dumbbell.stretched@2x.png) |
| `ui.icon_heart` | ![icon_heart at several sizes at 2×](icon_heart.stretched@2x.png) |
| `ui.icon_leaf` | ![icon_leaf at several sizes at 2×](icon_leaf.stretched@2x.png) |
| `ui.icon_flame` | ![icon_flame at several sizes at 2×](icon_flame.stretched@2x.png) |
| `ui.icon_trophy` | ![icon_trophy at several sizes at 2×](icon_trophy.stretched@2x.png) |
| `ui.icon_clock` | ![icon_clock at several sizes at 2×](icon_clock.stretched@2x.png) |

[All UI size comparisons on one sheet](ui.all-stretches@2x.png). [9-slice checks](ui-checks.json).

## Cleanup and warnings

The model returned enlarged rasters rather than literal 8-pixel blocks. Cleanup samples the intended art grid, expands it to an exact 8× grid, and runs the required `pnpm pixelize strip` or `sprite` command with `--scale 8`. Neutral source snapping prevents headphone raster drift from entering a character swap ramp. Integer translations restore the intended effect motion after pixelize's bottom-centre alignment; sweat and notes move two pixels per step, and dust contacts the floor. A pixel comparison verifies that all 20 effect frames survive strip placement without any lost, changed or clipped pixels.

The initial automatic-scale pass produced oversize/cropping warnings for the 19 stills and for sweat, dust and notes. Those outputs were discarded and replaced by the explicit-grid cleanup. The final run has **no oversize or clipping warnings** and only these expected effect-size warnings:

- `fx.sweat`: `Frame heights vary a lot (4, 7, 6, 2). The head may change size between frames.`
- `fx.cheer`: `Frame heights vary a lot (12, 22, 28, 25). The head may change size between frames.`
- `fx.sparkle`: `Frame heights vary a lot (4, 7, 12, 4). The head may change size between frames.`

These effects intentionally grow, disperse or shrink; they contain no character heads. Dust, notes and all 19 stills emit no final warnings. [Final cleanup commands and warnings](cleanup.json).

## Validation and reproduction

- All 24 `pnpm pixelize check` calls pass with the exact strip or still size and correct palette. Every frame is nonempty; each animation has at least three distinct phases. [Image audit](checks.json).
- Binary transparency throughout; no magenta or off-palette pixels.
- Headphones use only neutral character colours and have been reviewed on every idle frame of every build, in down/up/right/left views.
- `pnpm assets:status` ran successfully; both generated inventory files were restored byte-for-byte immediately afterwards.
- `pnpm test`: **99 passed** on current main. `pnpm typecheck`: passed. The first sandboxed test run could not bind the end-to-end server's loopback port; rerunning with local socket access passed the full suite.
- No gameplay or viewer behaviour changed.

From the repository root:

```sh
# Requires the ignored raw generations to be present.
pnpm --filter @benchmaxxers/pixelize exec tsx ../../art/previews/batch-8/clean.ts
# Runs the 24 checks and inventory check, restoring both generated files.
pnpm --filter @benchmaxxers/pixelize exec tsx ../../art/previews/batch-8/verify.ts
# Composites only; reads final assets. Requires Pillow.
python3 art/previews/batch-8/preview.py
```
