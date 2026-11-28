// node --test lib/ai/quota_state.test.js
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');

process.env.AI_QUOTA_STATE_FILE = path.join(os.tmpdir(), `ai_quota_${process.pid}.json`);
process.env.MEDIA_VERDICT_FILE = path.join(os.tmpdir(), `verdicts_${process.pid}.json`);
const quota = require('./quota_state');
const { _test: guard } = require('../ingestion/media_guard');

test('Cloudflare 하루 Neurons 소진은 다음 00:00 UTC까지 기록된다', () => {
  quota._test.reset();
  const now = Date.parse('2026-11-27T22:55:00Z');
  const hit = quota.noteQuotaError('cloudflare', 'AiError: you have used up your daily free allocation of 10,000 neurons', now);
  assert.strictEqual(hit, true);
  assert.strictEqual(quota.isExhausted('cloudflare', now), true);
  assert.strictEqual(quota.isExhausted('cloudflare', Date.parse('2026-11-28T00:00:01Z')), false);
});

test('Groq TPD 소진은 1시간 동안만 건너뛴다', () => {
  quota._test.reset();
  const now = Date.parse('2026-11-27T22:55:00Z');
  assert.strictEqual(quota.noteQuotaError('groq-vision', 'Rate limit reached ... tokens per day (TPD): Limit 200000', now), true);
  assert.strictEqual(quota.isExhausted('groq-vision', now + 30 * 60 * 1000), true);
  assert.strictEqual(quota.isExhausted('groq-vision', now + 61 * 60 * 1000), false);
});

test('일반 오류(분당 한도·형식 오류)는 하루 한도로 보지 않는다', () => {
  quota._test.reset();
  assert.strictEqual(quota.noteQuotaError('cloudflare', "Bad input: required properties at '/'"), false);
  assert.strictEqual(quota.noteQuotaError('groq-vision', 'Rate limit reached ... tokens per minute (TPM)'), false);
  assert.strictEqual(quota.isExhausted('cloudflare'), false);
});

test('미디어 판정은 60일 기억하고 그 뒤엔 다시 확인한다', () => {
  guard.resetVerdicts();
  const now = Date.parse('2026-11-28T00:00:00Z');
  guard.storeVerdict('pixabay:123|Jeju Island', false, now);
  assert.strictEqual(guard.cachedVerdict('pixabay:123|Jeju Island', now + 1000), false);
  assert.strictEqual(guard.cachedVerdict('pixabay:123|Gyeongbokgung Palace', now), undefined);
  assert.strictEqual(guard.cachedVerdict('pixabay:123|Jeju Island', now + 61 * 24 * 3600 * 1000), undefined);
});
