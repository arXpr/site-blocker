// Translates settings into declarativeNetRequest dynamic rules.
// "||example.com^" matches example.com and every subdomain (www, m, ...), but not
// "notexample.com" or "example.com.evil.net". Only top-level navigations are redirected,
// and the target is an extension page, so the rules can never re-match: no redirect loops.
export function buildRules(domains) {
  return domains.map((domain, i) => ({
    id: i + 1,
    priority: 1,
    action: {
      type: 'redirect',
      redirect: { extensionPath: `/src/blocked.html?site=${encodeURIComponent(domain)}` },
    },
    condition: { urlFilter: `||${domain}^`, resourceTypes: ['main_frame'] },
  }));
}

export const originFor = (domain) => `*://*.${domain}/*`;

export async function syncRules(settings) {
  const dnr = chrome.declarativeNetRequest;
  const active = [];
  const missing = [];
  if (settings.enabled) {
    const flags = await Promise.all(
      settings.domains.map((d) => chrome.permissions.contains({ origins: [originFor(d)] })),
    );
    settings.domains.forEach((d, i) => (flags[i] ? active : missing).push(d));
  }
  const existing = await dnr.getDynamicRules();
  const addRules = buildRules(active);
  // Remove old ids AND the ids we are about to add, so concurrent syncs never collide.
  const removeRuleIds = [...new Set([...existing.map((r) => r.id), ...addRules.map((r) => r.id)])];
  await dnr.updateDynamicRules({ removeRuleIds, addRules });
  return { active: active.length, missing };
}
