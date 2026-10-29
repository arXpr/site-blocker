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
  domains: [],
  headline: 'This site is blocked',
  message: 'You decided to stay focused. Come back when your work is done.',
  audioMode: 'none',
  audioUrl: '',
});

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

export async function resetAll() {
  await chrome.storage.local.clear();
  await chrome.storage.local.set({ settings: { ...DEFAULTS } });
}
