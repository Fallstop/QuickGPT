const toggle = document.getElementById('toggle');
const statusText = document.getElementById('status-text');

const OFF_SITE_MESSAGE = 'Open chatgpt.com to use quickGPT';

let offSite = false;

function render(enabled) {
  if (offSite) {
    toggle.classList.remove('is-on');
    toggle.setAttribute('aria-checked', 'false');
    toggle.setAttribute('aria-disabled', 'true');
    statusText.textContent = OFF_SITE_MESSAGE;
    return;
  }
  toggle.classList.toggle('is-on', enabled);
  toggle.setAttribute('aria-checked', String(enabled));
  toggle.removeAttribute('aria-disabled');
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

async function readActiveTabUrl() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab?.url ?? '';
  } catch {
    return '';
  }
}

const isOnSite = (url) => /^https:\/\/chatgpt\.com(\/|$)/.test(url);

(async () => {
  const url = await readActiveTabUrl();
  offSite = !isOnSite(url);
  document.body.classList.toggle('off-site', offSite);
  render(await readEnabled());
})();

toggle.addEventListener('click', async (e) => {
  if (offSite) {
    e.preventDefault();
    return;
  }
  const next = !(await readEnabled());
  chrome.storage.local.set({ enabled: next }, () => render(next));
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && 'enabled' in changes) {
    render(changes.enabled.newValue !== false);
  }
});
