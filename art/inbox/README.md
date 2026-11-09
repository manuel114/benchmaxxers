# Art inbox

Drop raw images from an image model here when the agent cleaning them up can't see your computer (for example a Codex cloud task). Upload them on GitHub with **Add file → Upload files**, named `<asset id>.png`, for example `ref.style_tile.png` or `char.build-1.walk_down.png`.

The agent cleans each one into `assets/` with `pnpm pixelize` and deletes it from here in the same pull request, so this folder stays empty on `main`.
