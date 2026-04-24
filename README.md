<p align="center">
  <img src="icons/banner.png" alt="quickGPT — ChatGPT, accelerated" width="720" />
</p>

<p align="center">
  <a href="#load-in-chrome"><img alt="Chrome Extension" src="https://img.shields.io/badge/Chrome-Extension-8b5cf6?style=flat-square&labelColor=0b0a10&logo=googlechrome&logoColor=c4b5fd" /></a>
  <img alt="Manifest V3" src="https://img.shields.io/badge/Manifest-V3-6d28d9?style=flat-square&labelColor=0b0a10" />
  <img alt="Service Worker" src="https://img.shields.io/badge/Service_Worker-module-8b5cf6?style=flat-square&labelColor=0b0a10" />
  <img alt="Status" src="https://img.shields.io/badge/status-demo-c4b5fd?style=flat-square&labelColor=0b0a10" />
</p>

<p align="center">
  <b>A Chrome extension that makes ChatGPT stream faster —
  by not using ChatGPT at all.</b>
</p>

<p align="center">
  <code>chatgpt.com</code> keeps its familiar UI. Behind it, every reply is
  served by a faster upstream.<br/>
  Install, pin, and chat. Zero config.
</p>

---

## Why

ChatGPT's UI is great. The streaming speed, sometimes, is not. quickGPT keeps
the UI you already know and silently swaps the backend for one that answers
quicker. Same prompt, same chat history, same model slug — faster tokens.

## How it works

quickGPT is three tiny scripts cooperating across Chrome's three execution
worlds (MAIN, ISOLATED, and the service worker). Each hop exists to dodge a
specific Chrome security constraint:

```
 chatgpt.com (MAIN world)              ISOLATED world            service worker
 ─────────────────────────             ──────────────            ──────────────
 interceptor.js                        bridge.js                 background.js
 ──────────────                        ─────────                 ─────────────
   fetch() monkey-patch   ── event ─▶   chrome.runtime port  ──▶  upstream proxy
   synthetic SSE stream   ◀─ event ──   {type:"chunk",delta} ◀──  OpenAI-style SSE
```

**`interceptor.js`** — runs at `document_start` in the MAIN world and
monkey-patches `window.fetch`. Any `POST` to
`/backend-anon/f/conversation` or `/backend-api/f/conversation` is
short-circuited with a synthetic `text/event-stream` response that
mimics ChatGPT's delta-encoded event protocol (see
`refrence/eventstream.txt`). Because `chatgpt.com`'s CSP blocks direct
cross-origin fetches from the page, the interceptor punts the real request
out via a `quickgpt:request` `CustomEvent`.

**`bridge.js`** — runs in the ISOLATED world so it can see both the page
events and the extension runtime. It relays each event to the service
worker over a `chrome.runtime` port, then re-emits every chunk back to the
page as a `quickgpt:response` event.

**`background.js`** — the service worker is not bound by page CSP and holds
`host_permissions` for the upstream. It calls
`/api/v1/chat/completions` with `stream: true`, parses the OpenAI-style SSE,
and posts each `{type:"chunk", delta}` back through the port as it arrives.

### A few details worth knowing

- **Model slug is cosmetic on the client.** The `model` field sent upstream
  is a placeholder — the upstream's `MODEL` env var is the source of truth
  and rewrites every request server-side. The slug the user picked in the
  ChatGPT UI is echoed back in the synthetic SSE so the UI stays consistent.
- **Conversation state is reconstructed locally.** The interceptor keeps an
  in-memory map of prior turns keyed by id + `parent_id`, walking
  `parent_message_id` back from each turn to rebuild the thread.
- **Long chats get trimmed.** If the reconstructed history exceeds
  ~240K tokens (roughly 960K chars), the middle is replaced with
  `[... middle of conversation truncated ...]`, keeping the first and most
  recent messages.
- **Persona pinning.** A system message is prepended telling the model it
  *is* ChatGPT's selected variant, so the voice matches the slug the user
  expects.

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked** and pick this directory.
4. Visit <https://chatgpt.com> and chat — replies stream from the upstream.

The toolbar icon pops a little switch: **ON** = quickGPT, **OFF** = normal
ChatGPT. History is per tab/session (in-memory); refreshing the page resets it.

## Package

```sh
pnpm package
```

Produces `quickgpt.zip` with everything the Chrome Web Store needs:
`manifest.json`, the three scripts, the popup, and the `icons/` folder.
