import { getSettings } from './lib/storage.js';
import { syncRules } from './lib/rules.js';

// Serialise syncs so rapid edits can't interleave.
let queue = Promise.resolve();
function sync() {
  queue = queue.then(async () => {
    try {
      await syncRules(await getSettings());
    } catch (err) {
      console.error('[Focus Site Blocker] Could not update blocking rules:', err);
    }
  });
  return queue;
}

chrome.runtime.onInstalled.addListener(sync);
chrome.runtime.onStartup.addListener(sync);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) sync();
});
chrome.permissions.onAdded.addListener(sync);
chrome.permissions.onRemoved.addListener(sync);
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());
sync();
