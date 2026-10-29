# Manual test checklist (run in Chrome)

Setup: load unpacked, open the settings page, check `chrome://extensions` shows no errors for the extension.

**Blocking**
- [ ] Add `instagram.com` and allow Chrome's host access prompt. Visit `instagram.com`, `www.instagram.com`, `m.instagram.com`: all show the blocking screen with "Blocked: instagram.com".
- [ ] Deny the access prompt: the domain is not added. Add it again and allow access to activate blocking.
- [ ] Revoke a listed site's access in Chrome: the settings row says "Not active: Chrome access needed". Select **Allow access** and grant it to reactivate blocking.
- [ ] Visit `notinstagram.com` and `instagram.com.example.org`: not blocked.
- [ ] Click a link to a blocked site from another page: blocked.
- [ ] Add `reddit.com`, remove `instagram.com`: Instagram opens, Reddit is blocked, no restart needed.
- [ ] Open the blocking page URL (`chrome-extension://<id>/src/blocked.html`) directly: it loads and does not loop.

**Domain list**
- [ ] Adding `https://www.YouTube.com/watch?v=1` stores `youtube.com`.
- [ ] Adding a duplicate, `localhost`, `bad domain`, or an empty value shows an error and adds nothing.
- [ ] Edit renames an entry; Escape cancels; Remove deletes it.

**Blocking screen**
- [ ] Upload PNG, JPG, WebP: each shows in the preview. A GIF, SVG or file over 2 MB shows an error.
- [ ] Edit headline/message: preview updates live. Save, close the tab, reopen settings: image, headline and message are still there.
- [ ] Remove image, save: blocking screen shows the text-only default.
- [ ] Message containing `<b>hi</b>` appears as literal text.
- [ ] Choose a supported audio file: upload mode is selected automatically. Save, then visit a blocked site: it loops while the page is open. Remove it and confirm no audio plays.
- [ ] Set an HTTPS audio URL, save, then visit a blocked site: it loops if reachable. An invalid URL is rejected.
- [ ] When autoplay is denied, **Play sound** starts audio. Audio does not play in the settings preview.
- [ ] **Go Back** returns to the previous page. **Open New Tab** opens a new tab and closes the blocked one.
- [ ] Enable visit history: blocked visits appear in settings with the correct site and time; clear history removes them.
- [ ] With visit logging on, enable automatic selfie capture and grant camera access: opening a blocked site stores a low-resolution selfie locally. Revoke camera access: the visit is still logged, and the blocking page explains that no selfie was saved.
- [ ] Confirm settings preview does not record visits; records older than 3 days are removed when history is opened or another visit is logged; only the latest 50 are retained.
- [ ] Disable visit history: new visits are no longer recorded; resetting defaults turns logging and camera capture off and clears history.

**Switches**
- [ ] Master toggle off: 5-second wait, then sites open normally. On: blocked again.
- [ ] Strict mode on: toggling off, removing a site, or resetting needs 20 seconds and the typed phrase.
- [ ] Reset to defaults clears everything, including audio, visit history, camera settings and granted site access, and the previously blocked site opens.

**Persistence**
- [ ] Restart Chrome: the list, image, message, audio settings and master switch are unchanged and blocking still works.
- [ ] Click the extension's reload button in `chrome://extensions`: settings persist.
