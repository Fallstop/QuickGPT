const MODEL = 'nvidia/nemotron-3-nano-30b-a3b:free';
const UPSTREAM_URL = 'https://speedy-gpt.jmw.nz/v1/chat/completions';

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'quickgpt:upstream') return;

  const controller = new AbortController();
  let started = false;

  port.onDisconnect.addListener(() => controller.abort());

  port.onMessage.addListener(async (msg) => {
    if (started) return;
    started = true;

    try {
      const res = await fetch(UPSTREAM_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'text/event-stream',
        },
        body: JSON.stringify({
          model: MODEL,
          messages: msg.messages ?? [],
          stream: true,
        }),
        signal: controller.signal,
        cache: 'no-store',
      });

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '');
        safePost(port, {
          type: 'error',
          message: `Upstream ${res.status}: ${text.slice(0, 400)}`,
        });
        safeDisconnect(port);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let doneSeen = false;
      let chunkCount = 0;

      const processLine = (rawLine) => {
        const line = rawLine.trim();
        if (!line || !line.startsWith('data:')) return true;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') {
          doneSeen = true;
          return false;
        }
        try {
          const json = JSON.parse(payload);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            chunkCount++;
            safePost(port, { type: 'chunk', delta });
          }
        } catch {
          // keepalive or malformed
        }
        return true;
      };

      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf('\n')) !== -1) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (!processLine(line)) break outer;
        }
      }

      buf += decoder.decode();
      if (buf.trim()) processLine(buf);

      console.log(`[QuickGPT bg] stream finished, ${chunkCount} deltas, clean=${doneSeen}`);
      safePost(port, { type: 'done', clean: doneSeen });
    } catch (err) {
      if (err?.name !== 'AbortError') {
        safePost(port, { type: 'error', message: err?.message ?? String(err) });
      }
    } finally {
      safeDisconnect(port);
    }
  });
});

function safePost(port, msg) {
  try {
    port.postMessage(msg);
  } catch {}
}

function safeDisconnect(port) {
  try {
    port.disconnect();
  } catch {}
}
