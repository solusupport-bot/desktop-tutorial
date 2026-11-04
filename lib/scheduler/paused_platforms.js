// Temporary channel pause requested by the owner on 2026-11-03.
// Remove a channel from this set only after its publishing method is fixed.
const PAUSED_PLATFORMS = new Set(['reddit', 'tumblr']);

const isPlatformPaused = (platform) => PAUSED_PLATFORMS.has(platform);

module.exports = { PAUSED_PLATFORMS, isPlatformPaused };
