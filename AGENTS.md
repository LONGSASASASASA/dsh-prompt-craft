# dsh-prompt-craft — agent notes

Composer prompt-enhancement plugin for DSH (goal-first rewrite, diff review,
clarifying questions, refine loop) plus a WeChat bot inbox (iLink protocol,
fill-only). Published: https://github.com/LONGSASASASASA/dsh-prompt-craft

## Layout invariants (read before touching any UI)

- **Docked widgets align themselves.** Anything registered in
  `conversation.input.dock` (the enhancement panel, the WeChat notice) must call
  `useComposerAlign(ref)` from `src/client/align.js`. The composer is a rounded
  card inset inside a wider column; hardcoded `margin: 0 16px` breaks on wide
  layouts. This regression shipped twice — do not repeat it by "simplifying"
  the helper back into CSS.
- **Regression proof:** `node .tmp/probe-align.mjs` (headless Edge + isolated
  instance) must report `delta {"left":0,"right":0,"width":0}` for natural 1440,
  widened-stack 1400 (inline margins ≈313/313), narrow 620 and 1920 layouts.
  Unit tests live in `test/align.test.cjs`.
- **Keep the public slot contract.** Tests assert exact class names
  (`dpc-panel`, `dpc-panel-inner`, `dpc-split`, `dpc-close`), `data-filled`,
  `data-selected`, `role="region"`, and the four registrations
  (`conversation.input.right` order 10, `conversation.input.dock` panel order
  20 / weixin notice order 12, `settings.section` order 40).

## Recent conversation as context (0.4.5)

- src/host/context.cjs reads the live session (ctx.sessions.get(id), host ids are
  session-<uuid>) and projects deriveMessages() into at most 6 text messages
  (700 chars each, 3000 total). esolveSession also accepts a bare uuid because
  some client surfaces expose that.
- The context is fenced and demoted to untrusted background in
  src/host/templates.cjs; it must never be copied into the result.
- Best-effort: any failure returns []; the enhancement proceeds unchanged.
- Client toggle: Settings → 附带对话上下文 (includeContext, default on); the request
  carries withContext, and meta.contextMessages reports how many travelled.

## Build and test

```sh
npm run build   # esbuild: src/client/index.js -> lib/client.js (ModuleLoader wrapper), copies src/host + protocol
npm run check   # byte-compares lib/ with src/ (fails on drift)
node --test "test/**/*.test.cjs"   # 138 tests; a directory argument fails on Node 24
```

`lib/` is committed on purpose so `github:` installs work without a build step.

## Releasing

1. `npm run build && npm run check && node --test "test/**/*.test.cjs"`.
2. Bump `version` in `package.json` and `VERSION` in `src/protocol.cjs`
   (use a node script — PowerShell mangles inline quotes and UTF-8).
3. `git commit && git push`, `git tag -f -a vX.Y.Z && git push … vX.Y.Z`
   (push with `gh auth token` if the credential manager stalls).
4. `gh release create vX.Y.Z --notes-file …`.
5. Upgrade the local profile:
   `dsh plugin --profile desktop remove dsh-prompt-craft` then
   `dsh plugin --profile desktop add github:LONGSASASASASA/dsh-prompt-craft#vX.Y.Z`.
6. Verify the installed copy (`node -e` on the installed `package.json` and
   `lib/client.js` size), and confirm CI on the tag commit is green.

## WeChat bridge notes

- `src/host/weixin.cjs` implements the iLink protocol directly (no OpenClaw):
  `get_bot_qrcode` → `get_qrcode_status` long-poll → `getupdates` cursor poll;
  `errcode -14` means the session expired (re-scan).
- **The request body matters:** `request()` must set `init.body`; a missing body
  makes the server answer `{"ret":-1}` in milliseconds and the poll silently
  looks like "no messages" (this was the v0.4.1 bug). Non-zero `ret` must be
  surfaced in `lastError`.
- Inbound content is untrusted: only fills the draft (`inputActions.setDraft`),
  never auto-sends; queue is capped at 20 messages and 8000 chars each.
- Credentials live in `$DSH_HOME/prompt-craft/weixin.json`, mode 0600.
