// 2026-11-17 실측 버그: Groq가 막혀 reshapeByTemplate로 떨어질 때 facebook이 옛
// 번호목록+질문형 CTA 구조를 내서, 새 규칙이 템플릿 폴백 경로에선 전혀 적용되지
// 않고 있었다. 2026-11-18: 블로그 링크를 댓글 대신 본문에 다시 넣기로 하면서 CTA
// 줄도 "📖 Full guide: [LINK]"(queue_topic.js가 [LINK]를 실제 blogUrl로 바꿔치기)로
// 바뀌었다 — 여기서는 템플릿이 그 자리표시자를 정확히 내는지만 확인한다(실제 URL
// 치환은 queue_topic.test.js 쪽 책임).
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { reshapeByTemplate } = require('./curate');

test('reshapeByTemplate facebook ends with the [LINK] placeholder CTA', () => {
  const rawItem = {
    source: 'T-money transit card',
    content: 'T-money works on subway, buses, and most taxis nationwide. You can recharge it '
      + 'with cash or card at any station machine. A refundable deposit-style fee applies at purchase.'
  };
  const result = reshapeByTemplate(rawItem, 'facebook', 0);
  assert.ok(result.endsWith('📖 Full guide: [LINK]'), 'must end with the [LINK] placeholder CTA line');
  assert.ok(!/https?:\/\//.test(result), 'must never inline a real URL — queue_topic.js substitutes [LINK] later');
});

// 2026-11-18 실측 사고: 원 게시물(답글 체인의 첫 문단)이 promise 문장 혼자만 담고
// 있으면, 답글 체인이 끊길 때(Groq/Cloudflare 과부하 등으로 실제 반복 발생) "Everyone
// assumes this works the same as back home. It doesn't." 같은 완전 일반론 문장만
// 단독 게시된다 — PLATFORM_GUIDE가 명시적으로 금지하는 패턴이다. 답글 체인 성패와
// 무관하게 원 게시물 자체가 항상 구체적(숫자 포함 hook)이도록 보장한다.
['threads', 'bluesky', 'mastodon'].forEach((platform) => {
  test(`reshapeByTemplate ${platform} never leaves the first paragraph as a bare generic opener`, () => {
    const rawItem = {
      source: 'T-money transit card',
      content: 'T-money works on subway, buses, and most taxis nationwide. A refundable ₩500 '
        + 'deposit-style fee applies at purchase. You can recharge it with cash or card at any station.'
    };
    const result = reshapeByTemplate(rawItem, platform, 0);
    const firstParagraph = result.split('\n\n')[0];
    assert.ok(/₩500/.test(firstParagraph), 'first paragraph must carry the concrete hook, not just the generic opener');
  });
});

// 2026-11-19: 범용 오프닝 문장(구 PROMISE_OPENERS)이 어떤 템플릿 경로에서도 첫 줄로 나오면 안 된다.
['threads', 'bluesky', 'mastodon', 'instagram'].forEach((platform) => {
  test(`reshapeByTemplate ${platform} starts with the concrete source sentence`, () => {
    const rawItem = {
      source: 'T-money transit card',
      content: 'T-money works on subway, buses, and most taxis nationwide. A refundable ₩500 '
        + 'deposit-style fee applies at purchase. You can recharge it with cash or card at any station.'
    };
    for (let seed = 0; seed < 12; seed += 1) {
      const first = reshapeByTemplate(rawItem, platform, seed).split('\n\n')[0];
      assert.ok(first.startsWith('A refundable ₩500'), `seed ${seed}: first paragraph was "${first}"`);
    }
  });
});
