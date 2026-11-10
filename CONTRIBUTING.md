# Contributing

Thanks for helping. DesignStudio is free for noncommercial use under the [PolyForm Noncommercial License 1.0.0](LICENSE.txt). By sending a contribution, you agree that it can be shared under that licence.

1. Open an issue first for anything bigger than a small fix.
2. Run the app from source: open `index.html` in Chrome or Edge.
3. Before you send a pull request, run:
   - `node tools/check-publish.mjs`: the safety check (no secrets, private files or large files).
   - From `tests/`: `npm install` once, then `node qa.js`.
4. Keep the app working offline, with no build step needed to run it.
