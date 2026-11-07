# dsh-prompt-craft

> Press ✨ in the DSH composer and turn a rough draft into a sharper, more actionable prompt — **review the diff first, then accept it hunk by hunk**.

`dsh-prompt-craft` is a prompt-enhancement plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). It adds a ✨ button to the composer tool row (just left of the model picker). One click sends the current draft to the model and shows the rewrite in an inline panel with a readable diff, per-hunk selection, and a refine loop.

[中文](./README.md)

## Why "diff first"

Most one-click optimizers replace your whole draft, so you cannot tell what changed or keep only half of it. This plugin does the opposite:

- **Diff before apply** — additions, removals and rewrites are grouped by line; every hunk (group) is individually selectable.
- **Apply only what you picked** — the merged text is written back into the composer, and "Undo" restores the original at any time.
- **Iterate instead of restarting** — type "make it shorter" to refine the last result.
- **Ask when the draft is underspecified** — if key constraints (language, format, length, audience…) are missing, the model returns 1–2 questions instead of guessing.

## Features

- ✨ **One-click enhancement** — a composer toolbar button; cancels while running.
- 🎚 **Three intensities** — Light (tighten the wording) / Standard (add structure and constraints) / Expert (rewrite as a full spec).
- 🧭 **Automatic scenario detection** — code / writing / research / agent / general, or pick one manually.
- 🧩 **Diff preview + hunk-level accept** — per-hunk checkboxes, a side-by-side view, apply-all, and undo.
- ❓ **Clarifying questions** — answer 1–2 questions and the draft is rewritten with those answers folded in.
- 🔁 **Refine loop** — give the last rewrite another instruction.
- ⚙️ **Settings page** — UI language, default intensity, default scenario, model override.
- 🌏 **Chinese and English UI** — follows the browser language, overridable in settings.

## Install

Requires DSH `>= 0.2.2-rc.1`.

```bash
# Straight from GitHub (no npm publish needed)
dsh plugin --profile desktop add github:LONGSASASASASA/dsh-prompt-craft#v0.1.0

# Or from npm (once published)
dsh plugin --profile desktop add dsh-prompt-craft

# Local development: install the checkout itself (pnpm link semantics)
dsh plugin --profile desktop add file:/path/to/dsh-prompt-craft
```

Restart the DSH app afterwards — plugin bundles are loaded at startup. The ✨ button then appears in the composer tool row.

Uninstall:

```bash
dsh plugin --profile desktop remove dsh-prompt-craft
```

## Usage

1. Type a draft into the composer (a sentence, a requirement, a half-written prompt — anything).
2. Click ✨.
3. A panel opens above the composer:
   - switch between **Sections** and **Compare**;
   - tick the changes you want, then "Apply selected n/m" or "Apply all";
   - click "Refine…" and type an instruction to iterate.
4. After applying, edit or send as usual; "Undo" restores the pre-enhancement draft.

## Settings

The settings page lives in DSH's plugin settings ("Prompt enhancement" section):

| Option | Description |
| --- | --- |
| UI language | Follow the browser / Chinese / English |
| Default intensity | Light / Standard / Expert (switchable in the panel) |
| Default scenario | Auto / Code / Writing / Research / Agent / General |
| Model | Follow the current session's model by default; optionally pin provider / model / reasoning effort |

By default the plugin uses exactly the model the current session is using (including temporary switches in the composer). Settings are stored in the browser's `localStorage` and never uploaded.

## Compatibility and design notes

- The host half (`lib/host/index.cjs`) registers one `POST /dsh-prompt-craft/rpc` route and calls the model through `ctx.llm.stream()`. It rejects cross-site requests, caps bodies at 1 MiB, times out after 120 s, and parses (with one repair retry) the model's JSON output.
- The browser half (`lib/client.js`) registers three DSH slots: `conversation.input.right` (button), `conversation.input.dock` (panel) and `settings.section` (settings page). No DOM patching, no host-code patching.
- It only uses modules DSH already shares (`react`, …); no runtime dependency is installed into your profile.

## Development

```bash
npm install
npm run build      # rebuild lib/ (host files copied, client bundled by esbuild)
npm test           # node --test, 92 cases
npm run check      # verify lib/ matches src/ (no build drift)
```

Layout:

```
src/protocol.cjs        # shared constants, validation, error codes
src/host/index.cjs      # plugin entry (registers the route)
src/host/rpc.cjs        # HTTP route, stream collection, timeout, repair retry
src/host/templates.cjs  # prompt templates (intensity / scenario / output contract)
src/host/parse-output.cjs
src/host/resolve-model.cjs
src/client/index.js     # slot registration
src/client/{button,panel,actions,store,rpc,i18n,styles,settings,diff}.js
```

## Privacy

- No telemetry and no outbound network calls of its own (only the DSH host's local route).
- The draft is forwarded to the model service you configured in DSH, and only when you click ✨.
- Settings live in `localStorage`; nothing else is written to disk.

## License

[MIT](./LICENSE)
