// 2026-11-17: 본문 링크를 빼고 첫 댓글로 옮기면서, 토큰이 없을 때의 모의 발행이
// 여전히 안전하게 동작하는지(크래시 없음, 블로그 홈 링크는 댓글도 안 닮) 확인한다.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { publishToFacebook } = require('./facebook');
const { BLOG_HOME_URL } = require('../ingestion/topic_blog_links');

test('publishToFacebook mock mode succeeds without a blogUrl', async () => {
  delete process.env.FB_PAGE_ACCESS_TOKEN;
  delete process.env.FB_PAGE_ID;
  const result = await publishToFacebook({ text: 'hello', imageUrl: null });
  assert.equal(result.id, 'mock_fb_post_id');
});

test('publishToFacebook mock mode does not log a comment for the bare blog home URL', async () => {
  delete process.env.FB_PAGE_ACCESS_TOKEN;
  delete process.env.FB_PAGE_ID;
  const result = await publishToFacebook({ text: 'hello', blogUrl: `${BLOG_HOME_URL}?utm_source=facebook` });
  assert.equal(result.id, 'mock_fb_post_id');
});
