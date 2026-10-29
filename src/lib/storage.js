// Settings live in chrome.storage.local under "settings"; image and audio data live separately.
export const LIMITS = {
  headline: 80,
  message: 300,
  domains: 500,
  imageBytes: 2 * 1024 * 1024,
  imageTypes: ['image/png', 'image/jpeg', 'image/webp'],
  audioBytes: 4 * 1024 * 1024,
  audioTypes: ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/mp4', 'audio/webm'],
};

export const DEFAULTS = Object.freeze({
  enabled: true,
  strict: false,
  visitHistoryEnabled: false,
  captureOnBlockedVisit: false,
  domains: [],
  headline: 'This site is blocked',
  message: 'You decided to stay focused. Come back when your work is done.',
  audioMode: 'none',
  audioUrl: '',
});

export const VISIT_HISTORY_PREFIX = 'visitHistory:';
const VISIT_HISTORY_RETENTION_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_VISIT_HISTORY = 50;
const IMAGE_RE = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const AUDIO_RE = /^data:audio\/(?:mpeg|wav|x-wav|ogg|mp4|webm);base64,[A-Za-z0-9+/=]+$/;
export const isValidImageDataUrl = (v) => typeof v === 'string' && IMAGE_RE.test(v);
export const isValidAudioDataUrl = (v) => typeof v === 'string' && AUDIO_RE.test(v);
export function isValidAudioUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function sanitize(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const domains = Array.isArray(s.domains)
    ? [...new Set(s.domains.filter((d) => typeof d === 'string' && d))].slice(0, LIMITS.domains)
    : [];
  return {
    enabled: typeof s.enabled === 'boolean' ? s.enabled : DEFAULTS.enabled,
    strict: typeof s.strict === 'boolean' ? s.strict : DEFAULTS.strict,
    visitHistoryEnabled: typeof s.visitHistoryEnabled === 'boolean' ? s.visitHistoryEnabled : DEFAULTS.visitHistoryEnabled,
    captureOnBlockedVisit: typeof s.captureOnBlockedVisit === 'boolean' ? s.captureOnBlockedVisit : DEFAULTS.captureOnBlockedVisit,
    domains,
    headline: typeof s.headline === 'string' && s.headline.trim() ? s.headline.slice(0, LIMITS.headline) : DEFAULTS.headline,
    message: typeof s.message === 'string' ? s.message.slice(0, LIMITS.message) : DEFAULTS.message,
    audioMode: ['none', 'upload', 'url'].includes(s.audioMode) ? s.audioMode : DEFAULTS.audioMode,
    audioUrl: isValidAudioUrl(s.audioUrl) ? s.audioUrl : DEFAULTS.audioUrl,
  };
}

export async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return sanitize(settings);
}

export async function saveSettings(settings) {
  const clean = sanitize(settings);
  await chrome.storage.local.set({ settings: clean });
  return clean;
}

export async function getImage() {
  const { blockImage } = await chrome.storage.local.get('blockImage');
  return isValidImageDataUrl(blockImage) ? blockImage : null;
}

export async function setImage(dataUrl) {
  if (!isValidImageDataUrl(dataUrl)) throw new Error('Unsupported image data.');
  await chrome.storage.local.set({ blockImage: dataUrl });
}

export async function clearImage() {
  await chrome.storage.local.remove('blockImage');
}

export async function getAudio() {
  const { blockAudio } = await chrome.storage.local.get('blockAudio');
  return isValidAudioDataUrl(blockAudio) ? blockAudio : null;
}

export async function setAudio(dataUrl) {
  if (!isValidAudioDataUrl(dataUrl)) throw new Error('Unsupported audio data.');
  await chrome.storage.local.set({ blockAudio: dataUrl });
}

export async function clearAudio() {
  await chrome.storage.local.remove('blockAudio');
}

function validVisitRecord(record) {
  return record && typeof record === 'object'
    && typeof record.timestamp === 'number'
    && typeof record.site === 'string'
    && (record.photo === null || isValidImageDataUrl(record.photo));
}

export async function getVisitHistory() {
  const all = await chrome.storage.local.get(null);
  const cutoff = Date.now() - VISIT_HISTORY_RETENTION_MS;
  const expiredKeys = [];
  const records = [];
  for (const [key, record] of Object.entries(all)) {
    if (!key.startsWith(VISIT_HISTORY_PREFIX)) continue;
    if (!validVisitRecord(record)) {
      expiredKeys.push(key);
      continue;
    }
    if (record.timestamp < cutoff) expiredKeys.push(key);
    else records.push({ key, ...record });
  }
  if (expiredKeys.length) await chrome.storage.local.remove(expiredKeys);
  return records.sort((a, b) => b.timestamp - a.timestamp);
}

export async function addVisitRecord({ site, photo }) {
  if (typeof site !== 'string' || (photo !== null && !isValidImageDataUrl(photo))) {
    throw new Error('Invalid visit history record.');
  }
  const existing = await getVisitHistory();
  const record = { timestamp: Math.max(Date.now(), (existing[0]?.timestamp ?? 0) + 1), site, photo };
  const key = `${VISIT_HISTORY_PREFIX}${crypto.randomUUID()}`;
  await chrome.storage.local.set({ [key]: record });
  const overflowCount = Math.max(0, existing.length - MAX_VISIT_HISTORY + 1);
  const overflow = overflowCount ? existing.slice(-overflowCount) : [];
  if (overflow.length) await chrome.storage.local.remove(overflow.map((item) => item.key));
  return { key, ...record };
}

export async function setVisitPhoto(key, photo) {
  if (typeof key !== 'string' || !key.startsWith(VISIT_HISTORY_PREFIX) || !isValidImageDataUrl(photo)) {
    throw new Error('Invalid visit history photo.');
  }
  const { [key]: record } = await chrome.storage.local.get(key);
  if (!validVisitRecord(record)) return false;
  await chrome.storage.local.set({ [key]: { ...record, photo } });
  return true;
}

export async function clearVisitHistory() {
  const all = await chrome.storage.local.get(null);
  const keys = Object.keys(all).filter((key) => key.startsWith(VISIT_HISTORY_PREFIX));
  if (keys.length) await chrome.storage.local.remove(keys);
}

export async function resetAll() {
  await chrome.storage.local.clear();
  await chrome.storage.local.set({ settings: { ...DEFAULTS } });
}
