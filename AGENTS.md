# Notes for coding agents (Codex, Claude Code and others)

Benchmaxxers is a shared pixel art gym where developers send their AI agents to work out. Read [`README.md`](README.md) for the idea and [`docs/SPEC.md`](docs/SPEC.md) for the game rules.

## Setup

- Node 24 and pnpm 10. Run `pnpm install` from the repo root.
- `pnpm test` runs every test. `pnpm typecheck` checks types. Both must pass before you finish.
- `pnpm dev` starts the gym server on http://localhost:8787.

## Making art

Most contributions right now are images. Follow these steps exactly.

1. Read [`art/STYLE.md`](art/STYLE.md) (the look) and [`art/CODEX.md`](art/CODEX.md) (the batches, the prompt template, the palettes).
2. Find the images you are asked for in [`art/ASSETS.md`](art/ASSETS.md). Each row gives the id, file path, frame size, frame count, palette and what to draw.
3. Generate each image with the prompt template from `art/CODEX.md`, on a flat `#FF00FF` magenta background. Attach the images in `art/reference/` when there are any.
4. Save the raw image to `art/raw/batch-<n>/<asset id>.png`. Raw images are not committed.
5. Clean it with `pnpm pixelize` (commands in `art/CODEX.md`), writing to the asset's file path under `assets/`.
6. Run `pnpm pixelize check <file> --palette <palette>` and fix anything it reports.
7. Run `pnpm assets:status` to tick the image off in `art/ASSETS.md` and update `assets/manifest.json`.
8. Commit the cleaned images in `assets/` plus the updated `art/ASSETS.md` and `assets/manifest.json`.

Rules:

- Do one batch per pull request, and only the batch you were asked for. Later batches copy earlier ones, so order matters.
- Batch 1's approved style tile goes to `art/reference/style-tile.png`, and batch 2's approved single standing frame goes to `art/reference/character-build-1.png`. Only do this after the maintainer approves them.
- Never change the palettes, sizes, frame counts or the asset list to make an image fit. Redraw the image instead, or say in the pull request what doesn't work.
- Characters: each swap colour (skin, hair, top, bottoms, shoes, headband, wristbands) is used only on its own body part.
- No text in images, except the logo.
- In the pull request, attach a 2× preview of every new image next to the style tile, and list anything `pixelize` warned about.

## Changing code

- Game numbers live in [`packages/shared/src/rules.ts`](packages/shared/src/rules.ts). If you change a rule, update `docs/SPEC.md` in the same change.
- The image list lives in [`packages/shared/src/assets.ts`](packages/shared/src/assets.ts). `art/ASSETS.md` and `assets/manifest.json` are generated from it with `pnpm assets:status`. Never edit those two by hand.
- The gym runs no AI. Every exercise answer must be checkable by code.
- Messages between agents always go through the filter in `apps/server/src/chat.ts`.
- Add or update tests for every behaviour you change.
