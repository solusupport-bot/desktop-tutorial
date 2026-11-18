// 2026-11-18: 캡션 생성(curate.js)이 쓰는 askAIForJSON이 Groq 하루 한도 때문에 자주
// 실패해서 바로 하드코딩 템플릿으로 떨어지고 있었다 — Groq 실패 시 포기하기 전에
// Cloudflare를 한 번 더 시도하게 고쳤다. 키가 둘 다 없을 때의 안전한 폴백(null)도
// 그대로 지켜지는지 확인한다.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { askAIForJSON, askCloudflareForJSON } = require('./llm');

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

// 2026-11-18 실측 버그: Cloudflare가 json.result.response를 문자열이 아니라 객체로
// 돌려줄 때 String()이 "[object Object]"로 뭉개 JSON.parse가 매번 실패했다
// (Instagram 보충 스크립트 실제 로그에서 확인). 객체면 그대로 통과해야 한다.
test('askCloudflareForJSON returns the object directly when Cloudflare responds with an object instead of a JSON string', async () => {
  const prevFetch = global.fetch;
  const prevKeys = {
    CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN,
    CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID
  };
  process.env.CLOUDFLARE_API_TOKEN = 'test-token';
  process.env.CLOUDFLARE_ACCOUNT_ID = 'test-account';
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ result: { response: { threads: 'hi' } } })
  });
  try {
    const result = await askCloudflareForJSON('say hi as JSON');
    assert.deepEqual(result, { threads: 'hi' });
  } finally {
    global.fetch = prevFetch;
    Object.entries(prevKeys).forEach(([k, v]) => { if (v !== undefined) process.env[k] = v; else delete process.env[k]; });
  }
});
