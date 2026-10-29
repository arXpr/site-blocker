// Domain normalisation + validation. Pure functions (no chrome.* usage).
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const TLD = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

/**
 * Accepts "instagram.com", "https://www.instagram.com/reels", "m.reddit.com:443" ...
 * Returns { ok: true, domain } or { ok: false, error }.
 * A leading "www." or "m." is stripped because subdomains are always blocked anyway.
 */
export function normalizeDomain(input) {
  let raw = String(input ?? '').trim().toLowerCase();
  if (!raw) return { ok: false, error: 'Enter a domain, for example instagram.com.' };
  if (/\s/.test(raw)) return { ok: false, error: 'A domain cannot contain spaces.' };

  raw = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//, ''); // scheme
  raw = raw.split(/[/?#]/)[0];                      // path / query / hash
  raw = raw.replace(/:\d+$/, '').replace(/\.$/, ''); // port, trailing dot

  const stripped = raw.replace(/^(?:www|m)\./, '');
  if (stripped.split('.').length >= 2) raw = stripped;

  const labels = raw.split('.');
  if (labels.length < 2 || !labels.every((l) => LABEL.test(l)) || !TLD.test(labels[labels.length - 1])) {
    return { ok: false, error: `"${String(input).trim().slice(0, 60)}" is not a valid domain.` };
  }
  if (raw.length > 253) return { ok: false, error: 'That domain is too long.' };
  return { ok: true, domain: raw };
}
