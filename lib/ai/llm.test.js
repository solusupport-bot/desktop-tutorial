// 2026-11-18: 캡션 생성(curate.js)이 쓰는 askAIForJSON이 Groq 하루 한도 때문에 자주
// 실패해서 바로 하드코딩 템플릿으로 떨어지고 있었다 — Groq 실패 시 포기하기 전에
// Cloudflare를 한 번 더 시도하게 고쳤다. 키가 둘 다 없을 때의 안전한 폴백(null)도
// 그대로 지켜지는지 확인한다.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { askAIForJSON } = require('./llm');

test('askAIForJSON returns null when neither GROQ_API_KEY nor Cloudflare credentials are set', async () => {
  const prevKeys = {
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN,
    CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID
  };
  delete process.env.GROQ_API_KEY;
  delete process.env.CLOUDFLARE_API_TOKEN;
  delete process.env.CLOUDFLARE_ACCOUNT_ID;
  try {
    const result = await askAIForJSON('say hi as JSON');
    assert.equal(result, null);
  } finally {
    Object.entries(prevKeys).forEach(([k, v]) => { if (v !== undefined) process.env[k] = v; });
  }
});
