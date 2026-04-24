# quickGPT — Privacy Policy

_Last updated: 2026-04-24_

quickGPT ("the extension") is a Chrome extension that intercepts outgoing
conversation requests on chatgpt.com and streams replies from a faster
upstream. This policy describes what data the extension handles, why, and
where it goes.

## 1. Who runs this

quickGPT is a personal / demo project. It is not operated by OpenAI and is
not affiliated with OpenAI, ChatGPT, or Anthropic. Contact:
contact@jmw.nz.

## 2. What data the extension handles

When the toolbar toggle is **ON** and you send a message on chatgpt.com,
the extension handles:

- **The prompt you typed**, plus the reconstructed prior turns of the same
  chat, so the upstream has context to reply with.
- **The model slug** ChatGPT's UI had selected (used only to echo back in
  the synthetic response so the UI stays consistent).

That is the entire set of data the extension reads or transmits.

The extension does **not** read, collect, or transmit:

- Your ChatGPT account, email, name, or profile data.
- ChatGPT auth cookies, tokens, or credentials.
- Payment or financial information.
- Health information.
- Your location or IP (beyond what any normal HTTPS request exposes to its
  destination server).
- Your browsing history or URLs from other sites.
- Keystrokes, clicks, mouse movement, or scroll activity.
- The DOM of chatgpt.com or any other page.

The extension only activates on `https://chatgpt.com/*`. It does nothing
on any other site.

## 3. Where the data goes

When the toggle is ON, the prompt and reconstructed conversation are sent
over HTTPS to the upstream at `https://speedy-gpt.jmw.nz/api/v1/chat/completions`,
which generates the reply and streams it back. The reply is rendered in
ChatGPT's own UI and is not stored by the extension.

No data is sent to any analytics, advertising, logging, or third-party
service. The extension contacts exactly two hosts: `chatgpt.com` (the page
you are already on) and `speedy-gpt.jmw.nz` (the upstream).

## 4. What is stored

- **Local browser storage (`chrome.storage`):** one value — whether the
  toggle is ON or OFF — so your preference persists across browser
  restarts.
- **In-memory conversation state:** the extension keeps the current chat's
  turns in memory so it can reconstruct context. This is cleared when the
  tab is closed or refreshed. It is never written to disk.

Nothing else is stored by the extension.

## 5. Upstream handling

The upstream at `speedy-gpt.jmw.nz` receives your prompt in order to
answer it. Standard web-server request logs (timestamp, IP, user agent,
request path) may be retained transiently for operational reasons.
Prompts and replies are not sold, shared, or used for advertising, and
are not used to train models by this project. Because the upstream
forwards requests to a third-party model provider in order to generate
replies, that provider's own terms apply to the content of your prompt
in transit.

## 6. Data sold or shared

None. quickGPT does not sell user data, share it with third parties for
advertising, or use it to assess creditworthiness or for lending.

## 7. Children

quickGPT is not directed at children under 13 and does not knowingly
collect data from them.

## 8. Your controls

- **Turn it off.** Click the toolbar icon and flip the toggle to OFF. The
  extension stops intercepting immediately; chatgpt.com behaves normally.
- **Uninstall.** Removing the extension deletes its local storage value
  and stops all network activity on its part.
- **Refresh.** Reloading the chatgpt.com tab clears the in-memory
  conversation state.

## 9. Changes

If this policy changes, the "Last updated" date at the top will change
and the new version will ship with the next release of the extension.

## 10. Contact

Questions or requests: contact@jmw.nz.
