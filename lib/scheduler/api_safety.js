const fs = require('fs');
const path = require('path');

const STATE_PATH = process.env.API_SAFETY_STATE_PATH
  || path.join(__dirname, '..', '..', 'data', 'api_safety_state.json');

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
// 2026-11-04 사용자 지시: 게시량을 2배로. dailyMax를 올릴 때 minIntervalMs가
// 24시간 안에 그만큼 못 채우면 글만 큐에 쌓이고 안 나가므로(threads/instagram이
// 딱 그 꼴이었다), 각 dailyMax를 minIntervalMs가 24시간에 구조적으로 허용하는
// 수치(24h / minIntervalMs)에 맞춰 같이 올렸다.
// 2026-11-04 추가 정정: Threads만 하루 8~10건(목표 9)으로 더 올라서, 그 목표가
// minIntervalMs 구조적 한도보다 높아지지 않게 간격도 2.5시간으로 좁혔다(24h/2.5h=9.6).
const POLICY = {
  threads: { minIntervalMs: 2.5 * HOUR, dailyMax: 10, group: 'meta' },
  facebook: { minIntervalMs: 2 * HOUR, dailyMax: 12, group: 'meta' },
  instagram: { minIntervalMs: 3 * HOUR, dailyMax: 8, group: 'instagram' },
  pinterest: { minIntervalMs: 4 * HOUR, dailyMax: 8, group: 'pinterest' },
  reddit: { minIntervalMs: 3 * HOUR, dailyMax: 8, group: 'reddit' },
  bluesky: { minIntervalMs: 90 * 60 * 1000, dailyMax: 16, group: 'bluesky' },
  mastodon: { minIntervalMs: 90 * 60 * 1000, dailyMax: 16, group: 'mastodon' },
  tumblr: { minIntervalMs: 2 * HOUR, dailyMax: 12, group: 'tumblr' },
  // 2026-11-05: 남의 게시물에 댓글 다는 신규 기능(scripts/engage-other-posts.js) 전용
  // 정책. 자체 콘텐츠 발행(post 발행)과 그룹을 분리해서, 한쪽 한도가 다른 쪽 큐를
  // 밀어내지 않게 한다. minIntervalMs는 호출부(engage-other-posts.js)가 그 안에서 또
  // 무작위 지터를 더해 매번 똑같은 간격으로 찍히지 않게 한다.
  // 2026-11-08 사용자 지시: "공격적으로" — 하루 소량으로 시작했던 dailyMax를 올렸다.
  // minIntervalMs는 그대로 둔다(건별 간격 자체는 이미 사람 수준의 속도라 안전장치로
  // 유지). 대신 lib/scheduler/engagement_halt.js가 봇 탐지 신호 발견 시 즉시 영구
  // 정지하는 서킷브레이커로 새로 추가됨 — "공격적으로, 단 봇 탐지되면 스톱"의 실제 제동장치.
  reddit_comment: { minIntervalMs: 20 * 60 * 1000, dailyMax: 12, group: 'reddit_comment' },
  bluesky_comment: { minIntervalMs: 15 * 60 * 1000, dailyMax: 16, group: 'bluesky_comment' },
  mastodon_comment: { minIntervalMs: 20 * 60 * 1000, dailyMax: 12, group: 'mastodon_comment' },
  // 2026-11-08: 우리 Threads 글에 달린 댓글에 자동으로 답글 다는 신규 기능
  // (scripts/auto-reply-threads.js) 전용 정책 — 위 *_comment(남의 글에 먼저 다는 댓글)와
  // 그룹을 분리한다. 우리 글 댓글에 답하는 건 스팸 위험이 상대적으로 낮아(이미 우리와
  // 상호작용한 사람에게 응답) 간격을 조금 더 좁혔다.
  threads_reply: { minIntervalMs: 10 * 60 * 1000, dailyMax: 20, group: 'threads_reply' }
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
