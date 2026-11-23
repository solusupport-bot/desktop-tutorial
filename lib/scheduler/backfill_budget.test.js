const test = require('node:test');
const assert = require('node:assert');
const { createBudget } = require('./backfill_budget');

test('예산 안에 끝나면 값을 돌려준다', async () => {
  const b = createBudget(1);
  const r = await b.withinBudget(Promise.resolve(7), 'x');
  assert.deepStrictEqual(r, { value: 7 });
});

test('예산을 넘기면 기다리지 않고 timedOut', async () => {
  process.env.BACKFILL_BUDGET_MIN = String(0.2 / 60); // 0.2초
  const b = createBudget(15);
  const started = Date.now();
  const r = await b.withinBudget(new Promise((res) => setTimeout(() => res(1), 5000)), 'slow');
  assert.ok(r.timedOut);
  assert.ok(Date.now() - started < 2000);
  delete process.env.BACKFILL_BUDGET_MIN;
});
