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

// 2026-11-09 사고 재발 방지: 실제 발행에서 본문 답글 하나가 실패해 답글 체인이
// 끊기자, 그 뒤에 있던 링크 답글이 통째로 안 달렸다("댓글에 랜드인코리아로 유도하는
// 글이 없다" — 사용자가 직접 삭제하고 발견). 링크 답글은 본문 답글 체인의 성패와
// 무관하게 항상 따로 시도해야 한다.
test('본문 답글이 실패해도 링크 답글은 그와 무관하게 시도된다', async () => {
  const calls = [];
  mockModule(axiosPath, {
    get: async () => ({ data: { status: 'FINISHED' } }),
    post: async (url, body) => {
      const decoded = decodeURIComponent(body.toString());
      calls.push({ url, body: decoded });
      // 본문 답글(링크가 아닌 reply_to_id 호출)만 실패 처리 — 메인 게시물과 링크
      // 답글은 전부 성공시킨다.
      if (url.endsWith('/threads') && decoded.includes('reply_to_id') && !decoded.includes('landinkorea.com')) {
        const err = new Error('simulated content-reply failure');
        err.response = { data: { error: { message: 'Unsupported post request', code: 100 } } };
        throw err;
      }
      return { data: { id: `mock_${calls.length}` } };
    }
  });

  delete require.cache[require.resolve('./threads')];
  process.env.THREADS_ACCESS_TOKEN = 'test-token';
  process.env.THREADS_USER_ID = 'test-user';
  const { publishToThreads } = require('./threads');

  try {
    await publishToThreads({
      text: 'Hook paragraph.\n\nThis content reply will fail every time.',
      blogUrl: 'https://landinkorea.com/test-post'
    });
  } finally {
    delete process.env.THREADS_ACCESS_TOKEN;
    delete process.env.THREADS_USER_ID;
  }

  const linkReplyAttempted = calls.some((c) => c.url.endsWith('/threads')
    && c.body.includes('reply_to_id') && c.body.includes('landinkorea.com'));

  assert.ok(linkReplyAttempted, '본문 답글이 실패해도 링크 답글은 여전히 시도돼야 한다');
});
