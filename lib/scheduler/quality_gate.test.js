const assert = require('node:assert/strict');
const { test } = require('node:test');
const { checkOpeners, recentFirstLines } = require('./quality_gate');

const NOW = Date.parse('2026-11-19T00:00:00Z');
const daysAgo = (n) => new Date(NOW - n * 86400000).toISOString();

test('checkOpeners rejects the old generic opener lines', () => {
  const problems = checkOpeners({ threads: "Everyone assumes this works the same as back home. It doesn't. T-money..." }, {});
  assert.deepEqual(problems, ['threads: 범용 오프닝 문장']);
});

test('checkOpeners rejects a first line reused on the same platform within 30 days', () => {
  const queue = [
    { status: 'published', platforms: ['threads'], scheduledAt: daysAgo(3), text: 'At Incheon Airport, you might assume X.\n\nmore' },
    { status: 'published', platforms: ['threads'], scheduledAt: daysAgo(45), text: 'Old line from long ago.\n\nmore' },
    { status: 'rejected', platforms: ['threads'], scheduledAt: daysAgo(1), text: 'Rejected line.' }
  ];
  const seen = recentFirstLines(queue, NOW);
  assert.equal(checkOpeners({ threads: 'At Incheon Airport, you might assume X.\n\nnew body' }, seen).length, 1);
  assert.equal(checkOpeners({ threads: 'Old line from long ago.' }, seen).length, 0, 'outside the 30-day window is allowed');
  assert.equal(checkOpeners({ threads: 'Rejected line.' }, seen).length, 0, 'rejected posts never went out');
  assert.equal(checkOpeners({ facebook: 'At Incheon Airport, you might assume X.' }, seen).length, 0, 'reuse is judged per platform');
});

test('checkOpeners passes a concrete, new first line', () => {
  assert.deepEqual(checkOpeners({ threads: "At Gyeongbokgung's main gate you'll assume you need a ticket." }, {}), []);
});
