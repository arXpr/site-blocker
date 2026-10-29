import { getSettings, getImage, getAudio, isValidImageDataUrl, addVisitRecord, setVisitPhoto } from './lib/storage.js';
import { normalizeDomain } from './lib/domain.js';

const params = new URLSearchParams(location.search);
const isPreview = params.get('preview') === '1';
const $ = (id) => document.getElementById(id);

function render({ headline, message, image, site }) {
  $('headline').textContent = headline;       // user text is only ever set via textContent
  $('message').textContent = message;
  const siteInfo = site ? normalizeDomain(site) : { ok: false };
  $('site').textContent = siteInfo.ok ? `Blocked: ${siteInfo.domain}` : 'Blocked site';
  if (isValidImageDataUrl(image)) {
    $('image').src = image;
    $('image').hidden = false;
  } else {
    $('image').removeAttribute('src');
    $('image').hidden = true;
  }
}

function startAudio(settings, audioData) {
  if (settings.audioMode === 'none') return;
  const audio = $('audio');
  const status = $('audioStatus');
  const playButton = $('playAudio');
  const source = settings.audioMode === 'url' ? settings.audioUrl : audioData;
  if (!source) {
    status.textContent = 'Audio is missing. Choose it again in extension settings.';
    status.hidden = false;
    return;
  }

  audio.src = source;
  const showRetry = (message) => {
    status.textContent = message;
    status.hidden = false;
    playButton.hidden = false;
  };
  audio.addEventListener('play', () => {
    status.hidden = true;
    playButton.hidden = true;
  });
  audio.addEventListener('error', () => {
    showRetry('Audio could not be loaded. Check the file or URL in settings, then try again.');
  });
  playButton.addEventListener('click', async () => {
    try {
      await audio.play();
    } catch (err) {
      console.error(err);
      showRetry('Audio could not start. Check the file or URL in settings.');
    }
  });
  audio.play().catch((err) => {
    console.warn('Automatic audio playback was blocked or failed.', err);
    showRetry(audio.error
      ? 'Audio could not be loaded. Check the file or URL in settings, then try again.'
      : 'Your browser blocked automatic playback. Select Play sound to start it.');
  });
}

async function captureSelfie() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is not available.');
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: 'user' },
    audio: false,
  });
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  try {
    const metadata = new Promise((resolve, reject) => {
      video.addEventListener('loadedmetadata', resolve, { once: true });
      video.addEventListener('error', () => reject(new Error('Camera preview could not start.')), { once: true });
    });
    video.srcObject = stream;
    await metadata;
    await video.play();
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 320 / video.videoWidth, 240 / video.videoHeight);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    if (!canvas.width || !canvas.height) throw new Error('Camera did not provide an image.');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Camera image could not be prepared.');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.6);
  } finally {
    stream.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
  }
}

async function recordBlockedVisit(settings, site) {
  const siteInfo = site ? normalizeDomain(site) : { ok: false };
  const record = await addVisitRecord({ site: siteInfo.ok ? siteInfo.domain : 'Blocked site', photo: null });
  const status = $('visitStatus');
  const roasts = [
    'Your focus plan filed a missing-person report. Last seen near this tab.',
    'A distraction again. The task remains at large.',
    'Your to-do list is starting a support group without you.',
  ];
  status.textContent = `${roasts[Math.floor(Math.random() * roasts.length)]} Visit logged on this device.`;
  status.hidden = false;
  if (!settings.captureOnBlockedVisit) return;
  let photo;
  try {
    photo = await captureSelfie();
  } catch (err) {
    console.warn('Could not capture a visit selfie:', err);
    status.textContent += ' No selfie was saved; allow camera access for this extension in Chrome.';
    return;
  }
  try {
    if (await setVisitPhoto(record.key, photo)) status.textContent += ' Selfie saved locally.';
  } catch (err) {
    console.error('Could not save the visit selfie:', err);
    status.textContent += ' The selfie could not be saved to extension storage.';
  }
}

async function closeThisTab() {
  const tab = await chrome.tabs.getCurrent();
  if (tab?.id !== undefined) await chrome.tabs.remove(tab.id);
}

async function init() {
  if (isPreview) {
    document.body.classList.add('preview');
    $('back').disabled = true;
    $('newtab').disabled = true;
    // Live draft updates from the settings page (same extension origin only).
    window.addEventListener('message', (e) => {
      if (e.origin !== location.origin || e.data?.type !== 'preview') return;
      const d = e.data.settings || {};
      render({ headline: String(d.headline ?? ''), message: String(d.message ?? ''), image: d.image, site: 'example.com' });
    });
  }
  try {
    const [settings, image, audio] = await Promise.all([getSettings(), getImage(), getAudio()]);
    render({ headline: settings.headline, message: settings.message, image, site: isPreview ? 'example.com' : params.get('site') });
    if (!isPreview) {
      startAudio(settings, audio);
      if (settings.visitHistoryEnabled) {
        recordBlockedVisit(settings, params.get('site')).catch((err) => {
          console.error('Could not record this blocked-site visit:', err);
          $('visitStatus').textContent = 'Visit history could not be saved on this device.';
          $('visitStatus').hidden = false;
        });
      }
    }
  } catch (err) {
    console.error(err);
    render({ headline: 'This site is blocked', message: '', image: null, site: params.get('site') });
  }
  if (isPreview) return;

  $('back').addEventListener('click', () => {
    if (history.length > 1) history.back();
    else $('newtab').click(); // nothing to go back to
  });
  $('newtab').addEventListener('click', async () => {
    try {
      await chrome.tabs.create({ active: true }); // opens the browser's new tab page
      await closeThisTab();                        // leave no blocked tab behind
    } catch (err) {
      console.error(err);
    }
  });
}
init();
