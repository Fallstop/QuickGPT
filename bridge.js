(() => {
  const ports = new Map();

  window.addEventListener('quickgpt:request', (e) => {
    const { reqId, messages } = e.detail ?? {};
    if (!reqId) return;

    const port = chrome.runtime.connect({ name: 'quickgpt:upstream' });
    ports.set(reqId, port);

    port.onMessage.addListener((msg) => {
      dispatch(reqId, msg);
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
