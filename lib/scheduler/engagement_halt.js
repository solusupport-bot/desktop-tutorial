const fs = require('fs');
const path = require('path');
const log = require('../logger');

// 2026-11-08 사용자 지시: "봇으로 인지하는 메시지가 나오면 스톱" — api_safety.js의
// 연속실패 차단(6시간 뒤 자동 재개)과 달리, 이건 플랫폼이 봇/의심활동으로 인식했다는
// 신호가 뜨면 사람이 이 파일에서 직접 지우기 전까지 영구 정지한다. 자동 재개가 오히려
// 계정 정지로 이어질 수 있는 상황이라 자동복구를 두지 않는다.
const STATE_PATH = path.join(__dirname, '..', '..', 'data', 'engagement_halt.json');

const BOT_SIGNAL = /automat|bot.?(detect|activity)|suspicious activity|unusual activity|verify (you'?re|you are) (a )?human|captcha|account (restricted|suspended|locked|flagged|disabled)|temporarily (restricted|blocked)|action blocked|too many requests from/i;

const loadState = () => {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch (_) {
    return {};
  }
};

const isHalted = (platform) => loadState()[platform] || null;

/** errorDetail에서 봇/의심활동 신호를 찾으면 해당 플랫폼을 영구정지하고 true를 반환한다. */
const checkAndHalt = (platform, errorDetail) => {
  const text = String(errorDetail || '');
  if (!text || !BOT_SIGNAL.test(text)) return false;
  const state = loadState();
  state[platform] = { haltedAt: new Date().toISOString(), reason: text.slice(0, 300) };
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  log.err(`[비상정지] ${platform}: 봇/의심활동 신호 감지 — "${text}" — data/engagement_halt.json에서 지우기 전까지 자동 재개하지 않음`);
  return true;
};

module.exports = { isHalted, checkAndHalt };
