// 2026-11-17 실측 버그: Groq가 막혀 reshapeByTemplate로 떨어질 때 facebook이 옛
// 번호목록+질문형 CTA 구조를 내서, 본문에 링크를 안 넣고 "Full guide in the
// comments"로 끝내는 새 규칙이 템플릿 폴백 경로에선 전혀 적용되지 않고 있었다.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { reshapeByTemplate } = require('./curate');

test('reshapeByTemplate facebook ends with the fixed comments CTA and never inlines a URL', () => {
  const rawItem = {
    source: 'T-money transit card',
    content: 'T-money works on subway, buses, and most taxis nationwide. You can recharge it '
      + 'with cash or card at any station machine. A refundable deposit-style fee applies at purchase.'
  };
  const result = reshapeByTemplate(rawItem, 'facebook', 0);
  assert.ok(result.endsWith('Full guide in the comments 👇'), 'must end with the fixed CTA line');
  assert.ok(!/https?:\/\//.test(result), 'must never inline a URL — the link goes in the first comment');
});
