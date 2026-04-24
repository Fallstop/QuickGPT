# QuickGPT

Demo Chrome extension that intercepts ChatGPT's conversation SSE stream on `chatgpt.com` and proxies it to `speedy-gpt.jmw.nz` (which in turn talks to OpenRouter with the configured auth). No client-side configuration needed.

## How it works

- `interceptor.js` runs at `document_start` in the MAIN world and monkey-patches `window.fetch`. Any `POST` to `/backend-anon/f/conversation` or `/backend-api/f/conversation` is short-circuited with a synthetic `text/event-stream` response that mimics ChatGPT's delta-encoded event protocol (see `refrence/eventstream.txt`).
- The interceptor dispatches a `quickgpt:request` `CustomEvent` because chatgpt.com's CSP blocks direct cross-origin fetches from the page.
- `bridge.js` (ISOLATED world) relays that event to the background service worker over a `chrome.runtime` port.
- `background.js` calls `https://speedy-gpt.jmw.nz/v1/chat/completions` with `stream: true`, parses the OpenAI-style SSE, and posts each `{type:"chunk",delta}` back through the port. The service worker is not bound by page CSP and has `host_permissions` for speedy-gpt.jmw.nz.
- The bridge re-emits each chunk as a `quickgpt:response` event; the interceptor translates deltas into ChatGPT's `event: delta` / `op: append` format as they arrive.
- The interceptor keeps an in-memory map of prior turns keyed by id + `parent_id`, so it can reconstruct the chat history from the `parent_message_id` that ChatGPT sends with each turn.
- If the reconstructed history exceeds ~240K tokens (roughly 960K chars) it cuts out the middle and inserts a `[... middle of conversation truncated ...]` marker, keeping the first and most recent messages.
- A persona system message is prepended telling the model it is ChatGPT's selected-variant, using the model slug the user picked in the ChatGPT UI. The same slug is echoed back in the synthetic SSE so the UI stays consistent.

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this directory.
4. Visit <https://chatgpt.com> and chat — replies stream from the proxy.

History is per tab/session (in-memory); refreshing the page resets it.

## Package

```sh
pnpm package
```

Produces `quickgpt.zip` containing the four extension files.
