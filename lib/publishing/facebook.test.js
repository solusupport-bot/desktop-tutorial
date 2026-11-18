// 2026-11-18: 블로그 링크는 호출부(queue_topic.js)가 본문에 직접 넣는다 — facebook.js는
// 더 이상 blogUrl을 따로 받거나 첫 댓글을 달지 않는다. 토큰이 없을 때 모의 발행이
// 안전하게 동작하는지만 확인한다.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { publishToFacebook } = require('./facebook');

test('publishToFacebook mock mode succeeds', async () => {
  delete process.env.FB_PAGE_ACCESS_TOKEN;
  delete process.env.FB_PAGE_ID;
  const result = await publishToFacebook({ text: 'hello', imageUrl: null });
  assert.equal(result.id, 'mock_fb_post_id');
});
