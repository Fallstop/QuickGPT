(() => {
  const ports = new Map();

  const pushEnabled = (enabled) => {
    window.dispatchEvent(
      new CustomEvent('quickgpt:enabled', {
        detail: { enabled: enabled !== false },
      }),
    );
  };

  chrome.storage.local.get(['enabled'], ({ enabled }) => pushEnabled(enabled));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && 'enabled' in changes) {
      pushEnabled(changes.enabled.newValue);
    }
  });

  window.addEventListener('quickgpt:request', (e) => {
    const { reqId, messages } = e.detail ?? {};
    if (!reqId) return;

    const port = chrome.runtime.connect({ name: 'quickgpt:upstream' });
    ports.set(reqId, port);

    port.onMessage.addListener((msg) => {
      dispatch(reqId, msg);
      // Background signalled terminal state explicitly; drop the entry now so
      // the onDisconnect handler below doesn't emit a duplicate 'done'.
      if (msg?.type === 'done' || msg?.type === 'error') {
        ports.delete(reqId);
      }
    });
    port.onDisconnect.addListener(() => {
      if (ports.has(reqId)) {
        dispatch(reqId, { type: 'done' });
        ports.delete(reqId);
      }
    });

    port.postMessage({ messages });
  });

  window.addEventListener('quickgpt:abort', (e) => {
    const { reqId } = e.detail ?? {};
    const port = ports.get(reqId);
    if (port) {
      try {
        port.disconnect();
      } catch {}
      ports.delete(reqId);
    }
  });

  function dispatch(reqId, msg) {
    window.dispatchEvent(
      new CustomEvent('quickgpt:response', { detail: { reqId, ...msg } }),
    );
  }
})();
