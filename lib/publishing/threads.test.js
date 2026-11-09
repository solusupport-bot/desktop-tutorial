// 2026-11-09: Threads 답글 체인 맨 끝에 실제 블로그 링크가 붙는지 확인하는 회귀 테스트.
// 실제 Threads API를 두드리지 않도록 'axios'를 가짜 모듈로 올려둔 뒤 './threads'를 불러온다.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const Module = require('module');

const axiosPath = require.resolve('axios');

const mockModule = (resolvedPath, exportsObj) => {
  const mod = new Module(resolvedPath);
  mod.exports = exportsObj;
  mod.loaded = true;
  require.cache[resolvedPath] = mod;
};

test('publishToThreads appends a final reply carrying the real blog link', async () => {
  const calls = [];
  mockModule(axiosPath, {
    get: async () => ({ data: { status: 'FINISHED' } }),
    post: async (url, body) => {
      calls.push({ url, body: decodeURIComponent(body.toString()) });
      return { data: { id: `mock_${calls.length}` } };
    }
  });

  delete require.cache[require.resolve('./threads')];
  process.env.THREADS_ACCESS_TOKEN = 'test-token';
  process.env.THREADS_USER_ID = 'test-user';
  const { publishToThreads } = require('./threads');

  try {
    await publishToThreads({
      text: 'Just one short hook sentence, no paragraphs.',
      blogUrl: 'https://landinkorea.com/test-post'
    });
  } finally {
    delete process.env.THREADS_ACCESS_TOKEN;
    delete process.env.THREADS_USER_ID;
  }

  const replyBodies = calls
    .filter((c) => c.url.endsWith('/threads') && c.body.includes('reply_to_id'))
    .map((c) => c.body);

  assert.equal(replyBodies.length, 1, '본문이 한 문단뿐이면 답글은 링크 답글 하나만 붙어야 한다');
  assert.ok(replyBodies[0].includes('https://landinkorea.com/test-post'), '마지막 답글에 실제 블로그 링크가 들어 있어야 한다');
});
