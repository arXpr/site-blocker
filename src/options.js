import { LIMITS, getSettings, saveSettings, getImage, setImage, clearImage, getAudio, setAudio, clearAudio, getVisitHistory, clearVisitHistory, VISIT_HISTORY_PREFIX, isValidAudioUrl, resetAll } from './lib/storage.js';
import { normalizeDomain } from './lib/domain.js';
import { syncRules, originFor } from './lib/rules.js';

const $ = (id) => document.getElementById(id);
const STRICT_PHRASE = 'I want to stop blocking';

let settings = null;      // last saved settings
let savedImage = null;    // image currently stored
let pendingImage;         // undefined = unchanged, null = removed, string = new (unsaved)
let savedAudio = null;
let pendingAudio;
let editing = null;       // domain currently being edited
let missing = new Set();

/* ---------- small helpers ---------- */
let statusTimer;
function setStatus(text, kind = 'ok') {
  const el = $('status');
  el.textContent = text;
  el.className = kind;
  clearTimeout(statusTimer);
  if (text) statusTimer = setTimeout(() => { el.textContent = ''; el.className = ''; }, 5000);
}
function showError(id, text) {
  const el = $(id);
  el.textContent = text || '';
  el.hidden = !text;
}
async function attempt(fn) {
  try { await fn(); }
  catch (err) {
    console.error(err);
    setStatus(`Something went wrong: ${err?.message || err}`, 'err');
    render();
  }
}

/* ---------- applying changes ---------- */
async function persist(next, message) {
  const clean = await saveSettings(next);
  await syncRules(clean); // apply now; the background worker also syncs on storage change
  settings = clean;
  await refreshPermissions();
  render();
  setStatus(message, 'ok');
}

async function refreshPermissions() {
  const flags = await Promise.all(settings.domains.map((d) => chrome.permissions.contains({ origins: [originFor(d)] })));
  missing = new Set(settings.domains.filter((_, i) => !flags[i]));
}
const requestAccess = (domain) => chrome.permissions.request({ origins: [originFor(domain)] });
async function releaseAccess(domain) {
  try { await chrome.permissions.remove({ origins: [originFor(domain)] }); } catch (e) { console.warn(e); }
}

/* ---------- confirmation dialog ---------- */
function guardLevel() {
  return settings.strict ? { seconds: 20, phrase: STRICT_PHRASE } : { seconds: 5, phrase: null };
}

function guard({ title, body, seconds = 0, phrase = null, confirmLabel = 'Confirm' }) {
  return new Promise((resolve) => {
    const dlg = $('guard');
    const confirmBtn = $('guardConfirm');
    const input = $('guardPhrase');
    const ac = new AbortController();
    let remaining = seconds;

    $('guardTitle').textContent = title;
    $('guardBody').textContent = body;
    $('phraseRow').hidden = !phrase;
    $('phraseText').textContent = phrase || '';
    input.value = '';
    confirmBtn.textContent = confirmLabel;

    const ready = () => remaining <= 0 && (!phrase || input.value.trim() === phrase);
    const update = () => {
      confirmBtn.disabled = !ready();
      $('guardCount').textContent = remaining > 0 ? `You can confirm in ${remaining} second${remaining === 1 ? '' : 's'}.` : '';
    };
    const timer = setInterval(() => { remaining -= 1; update(); if (remaining <= 0) clearInterval(timer); }, 1000);

    input.addEventListener('input', update, { signal: ac.signal });
    $('guardCancel').addEventListener('click', () => dlg.close('cancel'), { signal: ac.signal });
    confirmBtn.addEventListener('click', () => { if (ready()) dlg.close('ok'); }, { signal: ac.signal });
    dlg.addEventListener('close', () => {
      clearInterval(timer);
      ac.abort();
      resolve(dlg.returnValue === 'ok');
    }, { once: true });

    dlg.returnValue = '';
    update();
    dlg.showModal();
    (phrase ? input : $('guardCancel')).focus();
  });
}

/* ---------- rendering ---------- */
function render() {
  $('enabled').checked = settings.enabled;
  $('enabledLabel').textContent = settings.enabled ? 'Blocking on' : 'Blocking off';
  $('strict').checked = settings.strict;
  $('visitHistoryEnabled').checked = settings.visitHistoryEnabled;
  $('captureOnBlockedVisit').checked = settings.captureOnBlockedVisit;
  updateAudioFields();

  const list = $('domainList');
  list.replaceChildren();
  for (const domain of settings.domains) {
    const li = document.createElement('li');
    if (editing === domain) {
      const input = document.createElement('input');
      input.type = 'text';
      input.value = domain;
      input.setAttribute('aria-label', `Edit ${domain}`);
      const save = button('Save', () => attempt(() => commitEdit(domain, input.value)));
      const cancel = button('Cancel', () => { editing = null; showError('domainError', ''); render(); });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') save.click();
        if (e.key === 'Escape') cancel.click();
      });
      li.append(input, save, cancel);
      list.append(li);
      queueMicrotask(() => input.focus());
    } else {
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = domain;
      li.append(name);
      if (missing.has(domain) && settings.enabled) {
        const warning = document.createElement('span');
        warning.className = 'warn';
        warning.textContent = 'Not active: Chrome access needed';
        li.append(warning, button('Allow access', () => attempt(async () => {
          if (await requestAccess(domain)) {
            await persist(settings, `Blocking ${domain}.`);
          } else {
            setStatus(`Chrome access was not granted for ${domain}.`, 'err');
          }
        })));
      }
      li.append(
        button('Edit', () => { editing = domain; showError('domainError', ''); render(); }, `Edit ${domain}`),
        button('Remove', () => attempt(() => removeDomain(domain)), `Remove ${domain}`),
      );
      list.append(li);
    }
  }
  $('emptyList').hidden = settings.domains.length > 0;
  pushPreview();
}

async function renderVisitHistory() {
  const historyList = $('visitHistory');
  historyList.replaceChildren();
  const visits = await getVisitHistory();
  for (const visit of visits) {
    const item = document.createElement('li');
    if (visit.photo) {
      const photo = document.createElement('img');
      photo.src = visit.photo;
      photo.alt = 'Selfie captured when this blocked page opened';
      item.append(photo);
    }
    const details = document.createElement('div');
    details.className = 'entry';
    const site = document.createElement('strong');
    site.textContent = visit.site;
    const time = document.createElement('p');
    time.textContent = new Date(visit.timestamp).toLocaleString();
    details.append(site, time);
    if (!visit.photo) {
      const note = document.createElement('p');
      note.textContent = 'No selfie was saved.';
      details.append(note);
    }
    item.append(details);
    historyList.append(item);
  }
  $('emptyHistory').hidden = visits.length > 0;
}

function updateAudioFields() {
  const mode = $('audioMode').value;
  $('audioUploadField').hidden = mode !== 'upload';
  $('audioUrlField').hidden = mode !== 'url';
}

function button(label, onClick, ariaLabel) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  if (ariaLabel) b.setAttribute('aria-label', ariaLabel);
  b.addEventListener('click', onClick);
  return b;
}

function pushPreview() {
  const frame = $('preview');
  if (!frame.contentWindow) return;
  const image = pendingImage !== undefined ? pendingImage : savedImage;
  frame.contentWindow.postMessage(
    { type: 'preview', settings: { headline: $('headline').value, message: $('message').value, image } },
    location.origin,
  );
}

/* ---------- domain actions ---------- */
function checkNewDomain(raw, ignore) {
  const result = normalizeDomain(raw);
  if (!result.ok) return result;
  if (settings.domains.some((d) => d === result.domain && d !== ignore)) {
    return { ok: false, error: `${result.domain} is already on the list.` };
  }
  return result;
}

async function addDomain(raw) {
  if (settings.domains.length >= LIMITS.domains) return showError('domainError', `The list is limited to ${LIMITS.domains} websites.`);
  const result = checkNewDomain(raw);
  if (!result.ok) return showError('domainError', result.error);
  showError('domainError', '');
  if (!(await requestAccess(result.domain))) {
    return showError('domainError', `Chrome needs your approval to block ${result.domain}. Select Add again and choose Allow.`);
  }
  await persist({ ...settings, domains: [...settings.domains, result.domain] }, `Blocking ${result.domain}.`);
  $('domainInput').value = '';
}

async function commitEdit(oldDomain, raw) {
  const result = checkNewDomain(raw, oldDomain);
  if (!result.ok) return showError('domainError', result.error);
  showError('domainError', '');
  if (result.domain !== oldDomain && settings.strict) {
    const ok = await guard({ title: 'Change a blocked website?', body: `${oldDomain} will stop being blocked.`, ...guardLevel(), confirmLabel: 'Change website' });
    if (!ok) return;
  }
  if (result.domain !== oldDomain && !(await requestAccess(result.domain))) {
    return showError('domainError', `Chrome needs your approval to block ${result.domain}.`);
  }
  editing = null;
  await persist({ ...settings, domains: settings.domains.map((d) => (d === oldDomain ? result.domain : d)) }, `Updated ${result.domain}.`);
  if (result.domain !== oldDomain) await releaseAccess(oldDomain);
}

async function removeDomain(domain) {
  if (settings.strict) {
    const ok = await guard({ title: `Unblock ${domain}?`, body: 'Strict mode is on, so this needs a short wait.', ...guardLevel(), confirmLabel: 'Remove website' });
    if (!ok) return;
  }
  await persist({ ...settings, domains: settings.domains.filter((d) => d !== domain) }, `Removed ${domain}.`);
  await releaseAccess(domain);
}

/* ---------- image handling ---------- */
function decodeCheck(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('That file could not be read as an image.'));
    img.src = dataUrl;
  });
}
function readFile(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('The file could not be read.'));
    r.readAsDataURL(file);
  });
}

async function onImageChosen(file) {
  showError('imageError', '');
  if (!file) return;
  if (!LIMITS.imageTypes.includes(file.type)) return showError('imageError', 'Use a PNG, JPG or WebP image.');
  if (file.size > LIMITS.imageBytes) return showError('imageError', `That image is ${(file.size / 1048576).toFixed(1)} MB. The limit is 2 MB.`);
  try {
    const dataUrl = await readFile(file);
    await decodeCheck(dataUrl);
    pendingImage = dataUrl;
    pushPreview();
    setStatus('Image ready. Select “Save blocking screen” to keep it.', 'ok');
  } catch (err) {
    showError('imageError', err.message);
  }
}

async function onAudioChosen(file) {
  showError('audioError', '');
  if (!file) return;
  const audioType = file.type.split(';', 1)[0].trim().toLowerCase();
  if (!LIMITS.audioTypes.includes(audioType)) {
    return showError('audioError', 'Use an MP3, WAV, OGG, MP4 or WebM audio file.');
  }
  if (file.size > LIMITS.audioBytes) {
    return showError('audioError', `That audio is ${(file.size / 1048576).toFixed(1)} MB. The limit is 4 MB.`);
  }
  try {
    const dataUrl = await readFile(file);
    if (typeof dataUrl !== 'string') throw new Error('The audio file could not be read.');
    const separator = dataUrl.indexOf(',');
    if (!dataUrl.startsWith('data:') || separator < 0 || !dataUrl.slice(0, separator).toLowerCase().endsWith(';base64')) {
      throw new Error('The audio file could not be read.');
    }
    pendingAudio = `data:${audioType};base64,${dataUrl.slice(separator + 1)}`;
    $('audioMode').value = 'upload';
    updateAudioFields();
    setStatus('Audio ready. Select “Save blocking screen” to keep it.', 'ok');
  } catch (err) {
    showError('audioError', err.message);
  }
}

async function saveScreen() {
  const headline = $('headline').value.trim();
  if (!headline) return setStatus('The headline cannot be empty.', 'err');
  const message = $('message').value;
  const audioMode = $('audioMode').value;
  const audioUrl = $('audioUrl').value.trim();
  if (audioMode === 'upload' && (pendingAudio === null || (pendingAudio === undefined && !savedAudio))) {
    return showError('audioError', 'Choose an audio file before saving.');
  }
  if (audioMode === 'url' && !isValidAudioUrl(audioUrl)) {
    return showError('audioError', 'Enter a valid HTTP or HTTPS audio URL.');
  }
  showError('audioError', '');
  if (pendingImage === null) await clearImage();
  else if (typeof pendingImage === 'string') await setImage(pendingImage);
  if (pendingImage !== undefined) savedImage = pendingImage;
  if (audioMode === 'upload') {
    if (typeof pendingAudio === 'string') await setAudio(pendingAudio);
    if (typeof pendingAudio === 'string') savedAudio = pendingAudio;
  } else {
    await clearAudio();
    savedAudio = null;
  }
  pendingAudio = undefined;
  pendingImage = undefined;
  $('imageInput').value = '';
  $('audioInput').value = '';
  await persist({ ...settings, headline, message, audioMode, audioUrl: audioMode === 'url' ? audioUrl : '' }, 'Blocking screen saved.');
}

/* ---------- wiring ---------- */
function bind() {
  $('addForm').addEventListener('submit', (e) => { e.preventDefault(); attempt(() => addDomain($('domainInput').value)); });

  $('enabled').addEventListener('change', (e) => attempt(async () => {
    if (e.target.checked) return persist({ ...settings, enabled: true }, 'Blocking is on.');
    e.target.checked = true; // stays on until the confirmation succeeds
    const ok = await guard({ title: 'Turn blocking off?', body: 'Blocked websites will open normally until you turn it back on.', ...guardLevel(), confirmLabel: 'Turn off' });
    if (ok) await persist({ ...settings, enabled: false }, 'Blocking is off.');
  }));

  $('strict').addEventListener('change', (e) => attempt(async () => {
    if (e.target.checked) return persist({ ...settings, strict: true }, 'Strict mode is on.');
    e.target.checked = true;
    const ok = await guard({ title: 'Turn off strict mode?', body: 'Disabling and removing sites will become quicker.', ...guardLevel(), confirmLabel: 'Turn off' });
    if (ok) await persist({ ...settings, strict: false }, 'Strict mode is off.');
  }));

  $('visitHistoryEnabled').addEventListener('change', (e) => attempt(async () => {
    const enabled = e.target.checked;
    await persist({
      ...settings,
      visitHistoryEnabled: enabled,
      captureOnBlockedVisit: enabled && settings.captureOnBlockedVisit,
    }, enabled ? 'Blocked-site visit history is on.' : 'Blocked-site visit history is off.');
  }));

  $('captureOnBlockedVisit').addEventListener('change', (e) => attempt(async () => {
    if (!e.target.checked) {
      await persist({ ...settings, captureOnBlockedVisit: false }, 'Automatic selfie capture is off.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is not available in this browser.');
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    stream.getTracks().forEach((track) => track.stop());
    await persist({ ...settings, visitHistoryEnabled: true, captureOnBlockedVisit: true }, 'Selfie capture and visit history are on.');
  }));

  $('imageInput').addEventListener('change', (e) => attempt(() => onImageChosen(e.target.files[0])));
  $('audioMode').addEventListener('change', updateAudioFields);
  $('audioInput').addEventListener('change', (e) => attempt(() => onAudioChosen(e.target.files[0])));
  $('removeAudio').addEventListener('click', () => {
    $('audioMode').value = 'none';
    $('audioUrl').value = '';
    $('audioInput').value = '';
    pendingAudio = null;
    showError('audioError', '');
    updateAudioFields();
    setStatus('Audio removed. Select “Save blocking screen” to apply.', 'ok');
  });
  $('removeImage').addEventListener('click', () => {
    pendingImage = null;
    $('imageInput').value = '';
    showError('imageError', '');
    pushPreview();
    setStatus('Image removed. Select “Save blocking screen” to apply.', 'ok');
  });
  $('headline').addEventListener('input', pushPreview);
  $('message').addEventListener('input', pushPreview);
  $('saveScreen').addEventListener('click', () => attempt(saveScreen));
  $('preview').addEventListener('load', pushPreview);
  $('clearVisitHistory').addEventListener('click', () => attempt(async () => {
    await clearVisitHistory();
    await renderVisitHistory();
    setStatus('Visit history cleared.', 'ok');
  }));

  $('reset').addEventListener('click', () => attempt(async () => {
    const level = settings.strict ? guardLevel() : { seconds: 0, phrase: null };
    const ok = await guard({ title: 'Reset to defaults?', body: 'This clears your blocked websites, image, message, audio, visit history and strict mode.', ...level, confirmLabel: 'Reset' });
    if (!ok) return;
    const { origins = [] } = await chrome.permissions.getAll();
    if (origins.length) await chrome.permissions.remove({ origins }).catch((e) => console.warn(e));
    await resetAll();
    pendingImage = undefined;
    pendingAudio = undefined;
    editing = null;
    await load();
    await syncRules(settings);
    setStatus('Defaults restored.', 'ok');
  }));

  // Keep this page in sync if settings change elsewhere (another settings tab).
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings && !$('guard').open) attempt(async () => {
      settings = await getSettings();
      await refreshPermissions();
      render();
    });
    if (area === 'local' && Object.keys(changes).some((key) => key.startsWith(VISIT_HISTORY_PREFIX))) {
      attempt(renderVisitHistory);
    }
  });
  const onPermissionsChanged = () => attempt(async () => {
    await refreshPermissions();
    render();
  });
  chrome.permissions.onAdded.addListener(onPermissionsChanged);
  chrome.permissions.onRemoved.addListener(onPermissionsChanged);
}

async function load() {
  [settings, savedImage, savedAudio] = await Promise.all([getSettings(), getImage(), getAudio()]);
  await refreshPermissions();
  $('headline').value = settings.headline;
  $('message').value = settings.message;
  $('audioMode').value = settings.audioMode;
  $('audioUrl').value = settings.audioUrl;
  $('imageInput').value = '';
  $('audioInput').value = '';
  render();
  await renderVisitHistory();
}

bind();
attempt(load);
