# Benchmaxxers art style

This is the rule book for every picture in the game. Every asset follows it, whoever or whatever draws it, so the gym looks like one place.

## The look in one paragraph

Cosy, cute **16-bit pixel art**: big chunky square pixels, flat colours, clean dark outlines, like a Super Nintendo or Game Boy Advance RPG with an early-2000s free-game charm. Small sprites, few pixels, every pixel counts. The gym is warm and a bit silly: rubber floors, wooden benches, posters and plants. The agents are chunky little gym-goers with big heads, big eyes and visible muscles that grow as they train.

## Fixed numbers

| Thing | Value |
| --- | --- |
| Tile size | 16 × 16 art pixels |
| Gym room | 24 × 14 tiles (384 × 224 art pixels, about one Super Nintendo screen) |
| On screen | Always a whole-number zoom (3×, 4×), never blurred |
| Character frame | 16 wide × 24 tall |
| Character action frame (on a machine) | 32 × 32 |
| Character feet | Bottom of the feet (outline included) sits on row 22 of a 24-tall frame (1 empty row below) and is centred on column 8 |
| Background while generating | Solid `#FF00FF` magenta. Never use magenta in the art itself |
| File type | PNG, fully transparent background after cleanup, every pixel either fully see-through or fully solid |

## View and light

- **Three-quarter top-down view**: we look down at the floor at an angle and see the front of walls, machines and people. Like Stardew Valley or Eastward.
- **Light comes from the top left.** Highlights on top-left edges, shadows on bottom-right edges.
- Every object that stands on the floor gets a small flat shadow ellipse under it in `shadow` (`#3E3450`). Characters do **not** have the shadow baked in; the game draws it.

## Pixels

- One art pixel is one square. No half pixels, no blur, no soft brushes, no anti-aliasing.
- Shade with **3 tones per material** (shadow, base, light) from the palette ramps. No gradients.
- Dithering only on large flat areas (floor, walls), and only a 2-pixel checker between two neighbouring tones.
- **Outlines**: 1 pixel, colour `ink` (`#2B2238`) around characters and around the outside of objects. Inside an object, separate parts with the darkest tone of that material, not with ink.
- No pure black (`#000000`) and no pure white (`#FFFFFF`). Use `ink` and `cream`.

## Palettes

Two palettes. Nothing else is allowed. The cleanup tool snaps every pixel to the nearest colour, so off-palette colours get changed, sometimes badly.

- [`palettes/environment.json`](palettes/environment.json): 40 colours for floors, walls, machines, props, effects and UI.
- [`palettes/character.json`](palettes/character.json): 26 colours for agents and what they hold.

### Swap colours on characters

The game recolours parts of each agent so no two look the same. To make that work, each body part is drawn **only** in its own ramp:

| Part | Ramp | Default look |
| --- | --- | --- |
| Skin | `skin-1..3` | Medium brown |
| Hair | `hair-1..3` | Dark brown |
| Shirt or tank top | `top-1..3` | Blue |
| Shorts or leggings | `bottoms-1..3` | Navy |
| Shoes | `shoes-1..3` | Red |
| Headband | `headband-1..2` | Yellow, always drawn; the game hides it by recolouring it to the hair |
| Wristbands | `wristband-1..2` | Green, always drawn; the game hides them by recolouring them to the skin |

Never use a swap colour anywhere else. If the shirt's blue appears in the shoes, the shoes change colour when the shirt does.

## Characters

- **Proportions**: cute and chunky. The head is about a third of the height (about 8 pixels tall). Eyes are 1 × 2 pixels of `ink`. A 1-pixel mouth, 1-pixel `blush` cheeks. At this size, suggest details with one or two pixels rather than drawing them.
- **Gender-neutral body**, short-to-medium hair that stays inside the head shape (so the hair colour swap works), headband across the forehead, a wristband on each wrist, a top, shorts, shoes.
- **Four builds**, chosen by the agent's strength. Same head and face in all four; only the body changes.

| Build | Name | Body | Default top | Width at shoulders |
| --- | --- | --- | --- | --- |
| 0 | Noodle | Thin arms, slight slouch | Loose t-shirt | 7 px |
| 1 | Toned | Normal arms, stands straight | Fitted t-shirt | 8 px |
| 2 | Buff | Big arms, broad chest | Tight t-shirt | 10 px |
| 3 | Maxxed | Huge arms, very broad, tiny legs (the joke) | Tank top | 13 px, arms may touch the frame edge |

These are default reference outfits. Customization can choose a T-shirt, tank or
hoodie and shorts, joggers or leggings independently of build. Garments follow
the current body's shoulder and limb dimensions; they do not change the body
build. Keep the hoodie hood down so hair and headbands remain visible. All tops
still use only `top-1..3`, and all bottoms only `bottoms-1..3`. See
[`docs/CHARACTERS.md`](../docs/CHARACTERS.md) for the layer plan and concept previews.

- **Directions**: draw **down** (facing us), **up** (back to us) and **side** (facing right). The game mirrors side for facing left, so side sprites must not have text or one-sided details.

## Animation

| Animation | Directions | Frames | Speed | Notes |
| --- | --- | --- | --- | --- |
| Idle | down, up, side | 4 | 6 per second | Breathing: 1-pixel rise of the head on frames 2 and 3 |
| Walk | down, up, side | 4 | 10 per second | Contact, pass, contact, pass. 1-pixel head bob on pass frames |
| Wait: check watch | down | 4 | 6 per second | Lifts wrist, looks, lowers |
| Wait: sip water | down | 4 | 6 per second | Holds bottle (metal colours), sips |
| Wait: stretch | down | 4 | 4 per second | Arm stretch overhead. Used by flexible agents |
| Celebrate | down | 4 | 10 per second | Fist pump, little jump |
| Bench press | on bench | 4 | 8 per second | 32 × 32 frame. Lying on the back, head to the left, barbell up and down. The bench is a separate sprite |
| Drop the bar | on bench | 4 | 8 per second | Bar sinks onto the chest, arms flail, sweat drop |
| Run | on treadmill, side | 4 | 12 per second | 32 × 32 frame, faces right |
| Yoga: tree | on mat, down | 2 | 3 per second | 32 × 32 frame, gentle breathing |
| Yoga: warrior | on mat, side | 2 | 3 per second | 32 × 32 frame |
| Yoga: downward dog | on mat, side | 2 | 3 per second | 32 × 32 frame |

Every frame of one animation keeps the same head size and the same feet line. Anything that changes between frames should change by 1 pixel, not jump.

## Environment

- Floor: dark rubber in the weights area, wood in the cardio row and front, pastel rubber squares on the mats.
- Walls: light grey-lilac (`gray-4`) with a wooden skirting board and big windows letting in blue light (`blue-4`).
- Props are chunky and readable at 3× zoom: a name should be guessable from the silhouette alone.
- Machines are split into **back** and **front** layers when a character sits inside them, so the game can draw back layer, then character, then front layer. The asset list says which ones.

## UI and text

- UI pieces (speech bubbles, name tags, badges) use `cream` fill, `ink` outline and are drawn as **9-slice** pieces: corners stay sharp, middles stretch.
- Text is never drawn into images. The game writes all words with the pixel font [Pixelify Sans](https://fonts.google.com/specimen/Pixelify+Sans) (open licence).
- The logo is the one exception: a hand-made wordmark.

## Make it consistent

1. The first approved image (the **style tile**) goes into [`reference/`](reference/). Attach it to every later request.
2. The first approved character goes into `reference/` too. Attach it to every character request.
3. Run every new image through the cleanup tool (`pnpm pixelize`) before it goes into `assets/`. It snaps to the grid and the palette and tells you what is wrong.
4. Check the result at 4× zoom next to the style tile. If it doesn't look like it belongs in the same room, redo it.
