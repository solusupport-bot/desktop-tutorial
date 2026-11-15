// Temporary channel pause requested by the owner on 2026-11-03.
// Remove a channel from this set only after its publishing method is fixed.
// 2026-11-15: tumblr pause released — no local credentials to verify the
// connection first, so the next scheduled run (real Actions secrets) is the
// live test. reddit stays paused, unrelated issue.
const PAUSED_PLATFORMS = new Set(['reddit']);

const isPlatformPaused = (platform) => PAUSED_PLATFORMS.has(platform);

module.exports = { PAUSED_PLATFORMS, isPlatformPaused };
