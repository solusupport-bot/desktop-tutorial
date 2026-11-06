// 2026-11-06 사고(같은 글이 Threads에 반복 재발행됨) 재발 방지 회귀 테스트.
// 실제 큐 파일/플랫폼 API를 건드리지 않도록 './queue'와 '../publishing'을
// require.cache에 가짜 모듈로 먼저 올려둔 뒤 './run'을 불러온다.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('path');
const Module = require('module');

const queuePath = require.resolve('./queue');
const publishingPath = require.resolve('../publishing');
const apiSafetyPath = require.resolve('./api_safety');

const mockModule = (resolvedPath, exportsObj) => {
  const mod = new Module(resolvedPath);
  mod.exports = exportsObj;
  mod.loaded = true;
  require.cache[resolvedPath] = mod;
};

const loadRunWithMocks = ({ queue, publishImpl }) => {
  delete require.cache[require.resolve('./run')];
  const saveCalls = [];
  mockModule(queuePath, {
    loadQueue: () => queue,
    saveQueue: (q) => { saveCalls.push(JSON.stringify(q)); }
  });
  // 실제 data/api_safety_state.json에 테스트 호출이 기록되지 않도록 가짜로 둔다.
  mockModule(apiSafetyPath, {
    canPublishNow: () => ({ allowed: true, group: 'test' }),
    loadState: () => ({}),
    recordPublishResult: () => {}
  });
  const publishCalls = [];
  mockModule(publishingPath, {
    PLATFORMS: {
      threads: {
        requiresMedia: false,
        publish: async (payload) => {
          publishCalls.push(payload.text);
          return publishImpl(payload);
        }
      }
    }
  });
  const { publishClaimedPosts } = require('./run');
  return { publishClaimedPosts, saveCalls, publishCalls };
};

test('동일 텍스트가 이미 발행된 상태면 실제 API를 또 호출하지 않는다', async () => {
  const text = 'duplicate text';
  const queue = [
    { id: 'a', status: 'claimed', platforms: ['threads'], text, results: {} },
    { id: 'b', status: 'claimed', platforms: ['threads'], text, results: {} }
  ];
  const { publishClaimedPosts, publishCalls } = loadRunWithMocks({
    queue,
    publishImpl: async () => ({ id: 'live-post-1' })
  });

  await publishClaimedPosts();

  assert.equal(publishCalls.length, 1, '같은 텍스트로 handler.publish가 두 번 호출되면 안 된다');
  assert.equal(queue[0].status, 'published');
  assert.equal(queue[1].status, 'published');
  assert.equal(queue[1].results.threads.skipped, true);
});

test('한 항목 처리 중 예외가 나도 다른 항목들의 저장은 지켜진다', async () => {
  const queue = [
    { id: 'first', status: 'claimed', platforms: ['threads'], text: 'first text', results: {} },
    { id: 'throws', status: 'claimed', platforms: ['threads'], text: 'boom text', results: {} },
    { id: 'third', status: 'claimed', platforms: ['threads'], text: 'third text', results: {} }
  ];
  const { publishClaimedPosts, saveCalls } = loadRunWithMocks({
    queue,
    publishImpl: async (payload) => {
      if (payload.text.includes('boom text')) throw new Error('simulated crash');
      return { id: 'live-post' };
    }
  });

  await assert.doesNotReject(() => publishClaimedPosts());

  assert.equal(queue[0].status, 'published', '예외가 난 항목보다 먼저 처리된 항목은 published로 저장돼야 한다');
  assert.equal(queue[1].status, 'partial', '예외가 난 항목은 partial로 남아 다음 실행에 재시도된다');
  assert.equal(queue[2].status, 'published', '예외가 난 항목 뒤의 항목도 계속 처리돼야 한다');
  assert.ok(saveCalls.length >= 3, 'saveQueue는 항목마다 저장돼야 한다(끝에 한 번만이 아니라)');
});
