# Focus Site Blocker

A Manifest V3 Chrome extension that blocks the websites you choose and shows your own image, message, and optional looping audio instead. No backend or accounts. Audio URLs are loaded only when you choose one.

## Install (Load unpacked)

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Select **Load unpacked** and choose this folder (the one containing `manifest.json`).
4. Click the extension's toolbar icon (pin it from the puzzle-piece menu) to open settings.
5. Optional: in the extension's **Details**, turn on **Allow in Incognito** if you want blocking there too.

## Use

- **Add a site:** type `instagram.com` (a full URL also works) and press Add. Allow Chrome's access prompt to block it.
- **Subdomains:** blocking `instagram.com` also blocks `www.instagram.com`, `m.instagram.com` and any other subdomain. Blocking `news.ycombinator.com` blocks only that host and its subdomains, not `ycombinator.com`.
- **Edit / Remove:** buttons on each row.
- **Blocking screen:** pick an image (PNG, JPG, WebP, up to 2 MB), edit the headline and message, and optionally upload an audio file (MP3, WAV, OGG, MP4 or WebM, up to 4 MB) or enter an HTTP(S) audio URL. Audio loops while the blocked page is open; if the browser blocks autoplay, select **Play sound**. Select **Save blocking screen** to apply changes.
- **Master switch:** top right. Turning it off asks you to wait 5 seconds first.
- **Strict mode:** turning blocking off, removing or changing a site, turning strict mode off, or resetting then needs a 20-second wait and a typed phrase.
- **Reset to defaults:** clears the list, image, message, audio and strict mode.

## How it works

`src/background.js` converts your list into `declarativeNetRequest` dynamic rules (`||domain^`, main-frame only) that redirect to `src/blocked.html`. The browser does the redirect itself, before the page loads: no content scripts, no DOM replacement, no timers. Rules are rebuilt whenever settings change, so edits are live and survive restarts. The redirect target is an extension page that the rules cannot match, so redirect loops are impossible.

Permissions: `declarativeNetRequest` and `storage`, plus optional per-site host access requested when you add a site. Audio URL mode loads the URL you provide; uploaded audio stays in extension storage. You can revoke access in Chrome or remove a site from settings to release its access; sites without access are shown as inactive. No `tabs`.

## Limitations (honest list)

- **Only top-level navigations are blocked.** Single-page apps that change the URL without loading a page (for example clicking inside an already-open site) are not intercepted until the next real navigation. Reload or open the site fresh and it is blocked.
- **Already-open tabs** are blocked when they next navigate or reload, not the moment you add the site.
- **Strict mode is friction, not security.** Anyone can disable or remove the extension at `chrome://extensions`.
- **Incognito** needs "Allow in Incognito" turned on manually (Chrome's rule).
- **Audio autoplay** may be blocked by browser policy until you select **Play sound**. Remote audio URLs need to remain reachable and support playback in Chrome.
- **Visible to websites:** `blocked.html` is web-accessible (Chrome requires this for redirects from web pages), so a website could detect that this extension is installed. It exposes no data.
- Domain matching is by hostname. It does not look at page content, and other domains that mirror a site are not blocked unless you add them.

## Files

```
manifest.json
icons/icon16.png icon48.png icon128.png
src/background.js      keeps rules in sync with settings
src/lib/domain.js      domain parsing and validation
src/lib/rules.js       settings -> declarativeNetRequest rules
src/lib/storage.js     defaults, validation, chrome.storage.local access
src/blocked.html/.css/.js   the blocking screen
src/options.html/.css/.js   settings page
src/theme.css          shared colours and base styles
```

To change the look, edit the variables at the top of `src/theme.css`.
