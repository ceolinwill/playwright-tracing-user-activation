# Tracing marks every page as user-activated

With tracing on (`context.tracing.start({ snapshots: true })`, which is what the test runner's `trace` option uses), a page nobody clicked reports `navigator.userActivation.hasBeenActive === true` once it loads. Without tracing it reports `false`. So any app code that waits for the user's first gesture (sending something only after the first interaction, unmuting audio, opening a popup) behaves differently while a trace is recorded, and a test that checks the page wasn't activated passes without `--trace` and fails with it.

## Reproduction

```sh
npm install
npx playwright install chromium
npm run repro
```

Output:

```
without tracing: navigator.userActivation.hasBeenActive = false
with tracing: navigator.userActivation.hasBeenActive = true
BUG: tracing marked a page nobody interacted with as user-activated.
```

The script serves one static HTML page from a local server, opens it in two fresh contexts (one traced, one not), and reads `navigator.userActivation.hasBeenActive` through a CDP session with `userGesture: false`, because `page.evaluate` itself grants activation.

## Expected

Recording a trace doesn't change the page: `hasBeenActive` stays `false` until the test acts on the page.

## Actual

`hasBeenActive` is `true` right after `page.goto()` when tracing is on.

When tracing starts with snapshots, it starts a `HarTracer` (`packages/playwright-core/src/server/trace/recorder/tracing.ts`). The `HarTracer` creates a page entry for each page and, on the main frame's `domcontentloaded` and `load`, reads the page title and timings with `page.mainFrame().evaluateExpression(...)` in the utility world (`_onDOMContentLoaded` and `_onLoad` in `packages/playwright-core/src/server/har/harTracer.ts`). On Chromium every such evaluation goes through `CRExecutionContext.evaluateWithArguments`, which sends `Runtime.callFunctionOn` with `userGesture: true` (`packages/playwright-core/src/server/chromium/crExecutionContext.ts`). User activation is per frame, not per world, so these internal reads activate the page. Running the script with `DEBUG=pw:protocol` shows both calls with `"userGesture":true`.

A fix could run these internal reads without a user gesture (for example with `rawEvaluateJSON`, which the snapshotter already uses for its captures), or pass `userGesture: false` for evaluations Playwright makes on its own behalf.

## Environment

- Playwright 1.66.0-alpha-2026-11-14 (also 1.65.1), Chromium 159.0.8154.6
- Node 24.22.0, npm 11.19.1
- macOS 27.2.1, arm64
