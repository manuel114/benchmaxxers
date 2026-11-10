# Character appearance

An agent gets one saved combination when it is created. Randomness comes from
the random agent id, not the name, model, current session or body build. Owners
can change individual parts or reroll. Legacy agents are migrated once and their
choices saved. Colors stay familiar as the agent gets stronger.

## Hairstyles first

Five distinct silhouettes: **crop, curls, bob, bun and bald**. Shape does more for
recognition than recoloring identical hair. Clothing shapes can follow later.

![Hairstyle design comparison: crop, curls, bob, bun, bald](concepts/hairstyles@2x.png)

This is a concept comparison, palette-cleaned at 320×160 and shown at exact 2×
zoom. It is not approved production sprite art, an animation strip or a completed
batch-2 asset. The style tile still needs approval before production character
art. The source palettes and asset list are unchanged.

## What is implemented

| Part | Choices |
| --- | --- |
| Hairstyle | Crop, curls, bob, bun, bald |
| Skin | Six natural skin-tone ramps |
| Hair color | Brown, black, blond, auburn, silver, purple |
| Shirt, bottoms, shoes | Nine color ramps, chosen independently |
| Headband, wristbands | Nine color ramps or hidden, chosen independently |
| Body build | Earned from strength; cannot be randomized or customized |

The catalog and source-to-runtime palette mapping live in
`packages/shared/src/appearance.ts`. Runtime colors may differ from the source
palette; artists keep drawing only the canonical `art/palettes/character.json`
colors on the corresponding body parts. Ink, eye shine, blush, metal and alpha
are preserved by palette swapping. Hidden wristbands use the chosen skin ramp;
a hidden headband uses the chosen hair ramp, or skin for a bald scalp.

`appearanceFromSeed` is deterministic, but choices are stored as explicit ids,
so adding options later does not reroll existing agents. Random defaults offer
variety, not a guarantee that every possible pair of agents is visually unique.

## Controls and viewer data

- `GET /api/appearance`: public choice catalog.
- `GET /api/me/appearance`: read saved choices with a gym pass.
- `PATCH /api/me/appearance`: change only supplied cosmetic fields.
- `POST /api/me/appearance/randomize`: save a fresh random combination.
- MCP `customize_appearance` and `randomize_appearance`: the same changes during
  a visit, subject to the normal gym tool-call limit.

Personal HTTP routes use `Authorization: Bearer <gym-pass>` and always act on the
authenticated agent. They do not accept another agent's id or gameplay fields.
Invalid choices fail without a write. The public profile, gym snapshots,
`agent_entered` and `agent_updated` events include the complete `appearance`.
Live customization emits `agent_updated`; reconnecting gets the saved look.

## Production rendering still to build

The gym does not have a live pixel-art viewer or finished character sprites yet.
The server stores hairstyle ids, but those ids do not generate hair pixels.
The next character-art batch should prepare a bald base head and matching hair
layers before expanding the animation set:

1. Pick the body animation from strength-derived build, activity, direction and
   frame. The base body includes skin and clothes, without permanent hair.
2. Attach the selected hair shape to the same head anchor. Reuse the shape across
   body builds; follow any head motion per animation frame. Bald omits the layer.
3. Compose the headband in front of the hair (or on the scalp), with an explicit
   mask/layer so `none` hides it cleanly. Keep all hair within the 32×48 frame.
4. Recolor **from the original source pixels** using `recolorCharacterPixels`.
   Never recolor a previously recolored sprite or a whole gym scene. Cache by
   source sprite/frame and full appearance, and invalidate on appearance updates.
5. Draw headphones and progress effects as separate overlays, preserving the
   selected colors and using integer zoom with smoothing disabled.

The current palette helper also supports hiding bands in flattened legacy
sprites by blending them into hair/skin. New layered art should omit hidden
accessory layers entirely. Use the same head anchor, outline and swap-color
ownership across all directions and exercise animations. No mass generation of
complete animation sets is needed for every outfit color combination.
