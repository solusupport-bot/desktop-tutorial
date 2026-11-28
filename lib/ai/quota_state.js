// 무료 AI 하루 한도 소진 기록 (2026-11-28 사용자: "sns에 글이 안올라가 점검해줘").
//
// 실측: 11/26~28 인스타·페이스북이 멈췄다. Groq(하루 20만 토큰)·Cloudflare Workers AI(하루
// 1만 Neurons)·Pexels(시간당 한도)가 전부 바닥난 상태에서도, 보충 스크립트는 90분마다
// 같은 호출을 수십 번씩 반복했다. 한 번 "하루 한도 소진" 응답을 받으면 그 제공자는 한도가
// 풀릴 때까지 부르지 않는다 — 시간 낭비를 막고, 남은 한도를 비전 검증이 쓰게 한다.
// 검증을 건너뛰는 게 아니다: 부르지 않은 호출은 "확인 실패 = 탈락"으로 처리된다.
//
// 상태는 data/ai_quota_state.json에 남겨 다음 실행(다른 러너)도 같은 판단을 하게 한다.
// (scheduler.yml 보충 스텝이 data/를 커밋한다.)
const fs = require('fs');
const path = require('path');
const log = require('../logger');

const STATE_FILE = process.env.AI_QUOTA_STATE_FILE
  || path.join(__dirname, '..', '..', 'data', 'ai_quota_state.json');

let memory = null;

const load = () => {
  if (memory) return memory;
  try {
    memory = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) || {};
  } catch {
    memory = {};
  }
  return memory;
};

const save = () => {
  try {
    fs.writeFileSync(STATE_FILE, `${JSON.stringify(memory, null, 2)}\n`);
  } catch (err) {
    log.warn(`AI 한도 상태 저장 실패(이번 실행에만 적용): ${err.message}`);
  }
};

/** Cloudflare Workers AI 무료 Neurons는 매일 00:00 UTC에 초기화된다. */
const nextUtcMidnight = (now = Date.now()) => {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
};

/** provider의 하루 한도가 아직 소진 상태면 true. */
const isExhausted = (provider, now = Date.now()) => {
  const until = Date.parse((load()[provider] || {}).until || '');
  return Boolean(until) && until > now;
};

const markExhausted = (provider, untilMs, reason) => {
  load();
  const until = new Date(untilMs).toISOString();
  if ((memory[provider] || {}).until === until) return;
  memory[provider] = { until, reason: String(reason || '').slice(0, 160), markedAt: new Date().toISOString() };
  log.warn(`[AI 한도] ${provider} 하루 한도 소진 → ${until}까지 호출하지 않음`);
  save();
};

const CF_DAILY = /daily free allocation|neurons/i;
const GROQ_DAILY = /tokens per day|\bTPD\b|requests per day|\bRPD\b/i;

/**
 * 오류 메시지가 하루 한도 소진이면 기록하고 true를 돌려준다.
 * Groq 하루 한도는 24시간 이동창이라 정확한 해제 시각을 모른다 — 1시간 뒤 다시 시도한다.
 */
const noteQuotaError = (provider, message, now = Date.now()) => {
  const msg = String(message || '');
  if (provider === 'cloudflare' && CF_DAILY.test(msg)) {
    markExhausted(provider, nextUtcMidnight(now), msg);
    return true;
  }
  if (provider.startsWith('groq') && GROQ_DAILY.test(msg)) {
    markExhausted(provider, now + 60 * 60 * 1000, msg);
    return true;
  }
  return false;
};

module.exports = {
  isExhausted,
  markExhausted,
  noteQuotaError,
  nextUtcMidnight,
  _test: { reset: () => { memory = {}; } }
};
