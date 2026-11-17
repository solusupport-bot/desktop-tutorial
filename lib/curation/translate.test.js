// 2026-11-16: 다국어(EN/JA/ZH-Hans/ZH-Hant) 발행 추가 — 번역 조각이 답글 체인 한도를
// 넘겨 잘리지 않는지가 핵심이라, 그 압축 로직(compressToCap)과 GROQ_API_KEY 없을 때
// 영어만 그대로 나가는 안전한 폴백을 확인한다.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { addMultilingual, condense, compressToCap } = require('./translate');

test('compressToCap leaves short text alone, merges the rest into the last slot', () => {
  const text = ['a', 'b', 'c', 'd', 'e'].join('\n\n');
  assert.equal(compressToCap(text, 5), text);
  assert.equal(compressToCap(text, 3), 'a\n\nb\n\nc d e');
  assert.equal(compressToCap('only one paragraph', 3), 'only one paragraph');
});

test('condense joins every paragraph into one line for chain-platform translation input', () => {
  assert.equal(condense('hook\n\nreveal\n\nquestion?'), 'hook reveal question?');
  assert.equal(condense(''), '');
});

test('addMultilingual returns English untouched when no translation API key is configured', async () => {
  const prevKeys = {
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN,
    CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID
  };
  delete process.env.GROQ_API_KEY;
  delete process.env.CLOUDFLARE_API_TOKEN;
  delete process.env.CLOUDFLARE_ACCOUNT_ID;
  try {
    const input = { instagram: 'hello', threads: 'a\n\nb\n\nc\n\nd\n\ne' };
    const result = await addMultilingual(input);
    assert.deepEqual(result, input);
  } finally {
    Object.entries(prevKeys).forEach(([k, v]) => { if (v !== undefined) process.env[k] = v; });
  }
});
