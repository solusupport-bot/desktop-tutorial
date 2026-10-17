const fs = require('fs');
const path = require('path');

const STATE_PATH = process.env.API_SAFETY_STATE_PATH
  || path.join(__dirname, '..', '..', 'data', 'api_safety_state.json');

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const POLICY = {
  threads: { minIntervalMs: 3 * HOUR, dailyMax: 4, group: 'meta' },
  facebook: { minIntervalMs: 2 * HOUR, dailyMax: 6, group: 'meta' },
  instagram: { minIntervalMs: 3 * HOUR, dailyMax: 4, group: 'instagram' },
  pinterest: { minIntervalMs: 4 * HOUR, dailyMax: 4, group: 'pinterest' },
  reddit: { minIntervalMs: 3 * HOUR, dailyMax: 4, group: 'reddit' },
  bluesky: { minIntervalMs: 90 * 60 * 1000, dailyMax: 8, group: 'bluesky' },
  mastodon: { minIntervalMs: 90 * 60 * 1000, dailyMax: 8, group: 'mastodon' },
  tumblr: { minIntervalMs: 2 * HOUR, dailyMax: 6, group: 'tumblr' }
};
const GROUP_MIN_INTERVAL_MS = { meta: 45 * 60 * 1000 };
const FAILURE_LIMIT = 2;
const FAILURE_BLOCK_MS = 6 * HOUR;

const emptyState = () => ({ version: 1, platforms: {} });

const loadState = () => {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch (_) {
    return emptyState();
  }
};

const saveState = (state) => {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
};

const platformState = (state, platform) => {
  state.platforms[platform] ||= { attempts: [], successes: [], consecutiveFailures: 0, blockedUntil: null };
  return state.platforms[platform];
};

const groupLastAttempt = (state, group) => Object.entries(state.platforms)
  .filter(([platform]) => POLICY[platform]?.group === group)
  .map(([, value]) => new Date(value.lastAttemptAt || 0).getTime())
  .reduce((latest, timestamp) => Math.max(latest, timestamp), 0);

const canPublishNow = (platform, now = new Date(), state = loadState()) => {
  if (process.env.API_SAFETY_DISABLED === '1') return { allowed: true, group: platform };
  const policy = POLICY[platform] || { minIntervalMs: 2 * HOUR, dailyMax: 6, group: platform };
  const current = platformState(state, platform);
  const nowMs = now.getTime();
  const cutoff = nowMs - DAY;
  const successes = (current.successes || []).filter((timestamp) => new Date(timestamp).getTime() >= cutoff);

  if (current.blockedUntil && new Date(current.blockedUntil).getTime() > nowMs) {
    return { allowed: false, group: policy.group, reason: `연속 오류 보호 중 (${current.blockedUntil}까지)` };
  }
  if (current.lastAttemptAt && nowMs - new Date(current.lastAttemptAt).getTime() < policy.minIntervalMs) {
    return { allowed: false, group: policy.group, reason: '플랫폼 휴식 시간 미충족' };
  }
  if (successes.length >= policy.dailyMax) {
    return { allowed: false, group: policy.group, reason: `24시간 게시 한도 ${policy.dailyMax}건 도달` };
  }

  const groupInterval = GROUP_MIN_INTERVAL_MS[policy.group];
  const lastGroupAttempt = groupLastAttempt(state, policy.group);
  if (groupInterval && lastGroupAttempt && nowMs - lastGroupAttempt < groupInterval) {
    return { allowed: false, group: policy.group, reason: '연결 계정 공통 휴식 시간 미충족' };
  }
  return { allowed: true, group: policy.group };
};

const recordPublishResult = (platform, success, now = new Date()) => {
  if (process.env.API_SAFETY_DISABLED === '1') return;
  const state = loadState();
  const current = platformState(state, platform);
  const timestamp = now.toISOString();
  const cutoff = now.getTime() - DAY;
  current.attempts = [...(current.attempts || []), timestamp]
    .filter((value) => new Date(value).getTime() >= cutoff);
  current.successes = (current.successes || [])
    .filter((value) => new Date(value).getTime() >= cutoff);
  current.lastAttemptAt = timestamp;

  if (success) {
    current.successes.push(timestamp);
    current.consecutiveFailures = 0;
    current.blockedUntil = null;
    current.lastSuccessAt = timestamp;
  } else {
    current.consecutiveFailures = (current.consecutiveFailures || 0) + 1;
    current.lastFailureAt = timestamp;
    if (current.consecutiveFailures >= FAILURE_LIMIT) {
      current.blockedUntil = new Date(now.getTime() + FAILURE_BLOCK_MS).toISOString();
    }
  }
  saveState(state);
};

module.exports = {
  FAILURE_BLOCK_MS,
  FAILURE_LIMIT,
  POLICY,
  STATE_PATH,
  canPublishNow,
  loadState,
  recordPublishResult
};
