const toggle = document.getElementById('toggle');
const statusText = document.getElementById('status-text');

function render(enabled) {
  toggle.classList.toggle('is-on', enabled);
  toggle.setAttribute('aria-checked', String(enabled));
  statusText.textContent = enabled
    ? 'Enabled · quickGPT'
    : 'Disabled · normal GPT';
}

function readEnabled() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['enabled'], ({ enabled }) => {
      resolve(enabled !== false);
    });
  });
}

(async () => {
  render(await readEnabled());
})();

toggle.addEventListener('click', async () => {
  const next = !(await readEnabled());
  chrome.storage.local.set({ enabled: next }, () => render(next));
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && 'enabled' in changes) {
    render(changes.enabled.newValue !== false);
  }
});
