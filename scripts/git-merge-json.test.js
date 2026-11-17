// 2026-11-17: ci-commit-push.sh가 매 실행 등록하는 jsonmerge 드라이버의 핵심 병합
// 규칙(id로 배열 union, 양쪽이 안 바꾼 쪽을 가져오기)을 확인한다. 실제 git 호출 없이
// mergeValue를 직접 테스트한다.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const runDriver = (ancestor, ours, theirs) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsonmerge-'));
  const write = (name, value) => {
    const p = path.join(dir, name);
    fs.writeFileSync(p, JSON.stringify(value));
    return p;
  };
  const oPath = write('ancestor.json', ancestor);
  const aPath = write('ours.json', ours);
  const bPath = write('theirs.json', theirs);
  execFileSync(process.execPath, [path.join(__dirname, 'git-merge-json.js'), oPath, aPath, bPath]);
  return JSON.parse(fs.readFileSync(aPath, 'utf8'));
};

test('array keyed by id: items only added on one side both survive (the real daily-topic.yml vs scheduler.yml conflict)', () => {
  const ancestor = [{ id: '1', status: 'pending' }];
  const ours = [{ id: '1', status: 'pending' }, { id: '2', status: 'pending' }]; // daily-topic.yml queued a new topic
  const theirs = [{ id: '1', status: 'claimed' }]; // scheduler.yml claimed the existing one
  const merged = runDriver(ancestor, ours, theirs);
  assert.deepEqual(merged, [{ id: '1', status: 'claimed' }, { id: '2', status: 'pending' }]);
});

test('plain object: a key only one side touched is kept, untouched keys pass through', () => {
  const ancestor = { lastIndex: 5, lookup: { a: 1 } };
  const ours = { lastIndex: 6, lookup: { a: 1 } };
  const theirs = { lastIndex: 5, lookup: { a: 1, b: 2 } };
  const merged = runDriver(ancestor, ours, theirs);
  assert.deepEqual(merged, { lastIndex: 6, lookup: { a: 1, b: 2 } });
});

test('value log array (no id/topic key): union, no duplicates', () => {
  const ancestor = ['https://a.jpg'];
  const ours = ['https://a.jpg', 'https://b.jpg'];
  const theirs = ['https://a.jpg', 'https://c.jpg'];
  const merged = runDriver(ancestor, ours, theirs);
  assert.deepEqual(merged, ['https://a.jpg', 'https://b.jpg', 'https://c.jpg']);
});
