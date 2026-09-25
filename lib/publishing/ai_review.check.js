// 실행: node lib/publishing/ai_review.check.js — 검수 기록 규칙(판정만 기록, 같은 내용은 재호출 안 함)이 깨지면 실패한다.
const assert = require('assert');
const { addReviews, REVIEWERS } = require('./ai_review');

process.env.GROQ_API_KEY = 'test';
let calls = 0;
global.fetch = async (url, init) => {
  calls += 1;
  if (JSON.parse(init.body).model === REVIEWERS[1]) return { ok: false, json: async () => ({ error: { message: 'rate limit' } }) };
  return { ok: true, json: async () => ({ choices: [{ message: { content: '{"pass": true, "issues": []}' } }] }) };
};

(async () => {
  const post = { title: 't', description: 'd', body: 'b', faq: [] };
  const errors = [];
  const once = await addReviews(post, {}, (e) => errors.push(e.message));
  assert.deepStrictEqual(once.reviews.map((r) => r.reviewer), [REVIEWERS[0]], '호출 실패는 판정으로 기록하면 안 된다');
  assert.strictEqual(errors.length, 1);

  const twice = await addReviews(once, {}, () => {});
  assert.strictEqual(calls, 3, '이미 판정한 검수자는 다시 호출하지 않는다');
  assert.strictEqual(twice.reviews.length, 1);

  const edited = await addReviews({ ...twice, body: 'changed' }, {}, () => {});
  assert.strictEqual(edited.reviews.filter((r) => r.reviewer === REVIEWERS[0]).length, 2, '내용이 바뀌면 다시 검수한다');
  console.log('ai_review 검수 기록 OK');
})();
