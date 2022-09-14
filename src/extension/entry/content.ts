import { MESSAGE_ORIGIN_CONTENT, MESSAGE_ORIGIN_PAGE } from '@polkadot/extension-base/defaults';

chrome.runtime.onMessage.addListener((data): void => {
  window.postMessage({ ...data, origin: MESSAGE_ORIGIN_CONTENT }, '*');
});

window.addEventListener('message', (message): void => {
  if (message.origin !== MESSAGE_ORIGIN_PAGE) return;

  chrome.runtime.sendMessage(message);
});

async function getCurrentTab() {
  const queryOptions = { active: true, lastFocusedWindow: true };
  // `tab` will either be a `tabs.Tab` instance or `undefined`.
  const [tab] = await chrome.tabs.query(queryOptions);

  return tab;
}

async function injectScript() {
  const tab = await getCurrentTab();
  console.info(tab);
  chrome.scripting.executeScript({
    target: { tabId: tab.id as number },
    files: ['page.js'],
  });
}

injectScript();
