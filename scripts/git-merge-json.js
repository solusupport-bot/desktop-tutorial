#!/usr/bin/env node
// Git merge driver for data/*.json files that multiple CI workflows (daily-topic.yml,
// scheduler.yml) write to concurrently. 2026-11-16/17 실측: ci-commit-push.sh의
// "git pull --rebase" 재시도는 진짜 content conflict가 나면 그 자리에서 바로 죽는다
// (set -e 때문에 재시도 루프에 도달조차 못 함) — daily-topic.yml이 5일 연속 실패한
// 진짜 원인. 두 실행이 같은 배열/객체의 다른 위치를 건드리는 거라 수동 해결이 필요
// 없는 경우가 대부분이므로, 여기서 항상 자동으로 병합해 커밋 스크립트가 절대
// 멈추지 않게 한다.
//
// Usage (configured via `git config merge.jsonmerge.driver` + .gitattributes):
//   node scripts/git-merge-json.js %O %A %B
// %A is overwritten with the merge result; exit 0 always (never leaves conflict markers).
const fs = require('fs');

const readJSON = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Union two arrays, keyed by `id` (queue.json) or `topic` (topic_bank.json) when present,
// else by full-value equality (history/url logs). Items only on one side are kept;
// items on both sides with the same key keep the ours/theirs version if it differs
// from the ancestor's version for that key (prefer theirs on a true double-edit).
const mergeArray = (ancestor, ours, theirs) => {
  const keyOf = (item) => (item && typeof item === 'object')
    ? (item.id ?? item.topic ?? null)
    : null;
  const sampleKeyed = [...ancestor, ...ours, ...theirs].some((i) => keyOf(i) !== null);
  if (!sampleKeyed) {
    // Plain value log (URLs, etc.) — union, preserve ancestor order, then new entries.
    const seen = new Set(ancestor.map((i) => JSON.stringify(i)));
    const result = [...ancestor];
    for (const item of [...ours, ...theirs]) {
      const k = JSON.stringify(item);
      if (!seen.has(k)) { seen.add(k); result.push(item); }
    }
    return result;
  }

  const byKey = new Map();
  ancestor.forEach((item) => byKey.set(keyOf(item), { ancestor: item }));
  ours.forEach((item) => {
    const k = keyOf(item);
    const entry = byKey.get(k) || {};
    entry.ours = item;
    byKey.set(k, entry);
  });
  theirs.forEach((item) => {
    const k = keyOf(item);
    const entry = byKey.get(k) || {};
    entry.theirs = item;
    byKey.set(k, entry);
  });

  const order = [];
  const pushOnce = (k) => { if (!order.includes(k)) order.push(k); };
  ancestor.forEach((i) => pushOnce(keyOf(i)));
  ours.forEach((i) => pushOnce(keyOf(i)));
  theirs.forEach((i) => pushOnce(keyOf(i)));

  return order.map((k) => {
    const { ancestor: a, ours: o, theirs: t } = byKey.get(k);
    if (o === undefined) return t; // added/kept only on theirs' side
    if (t === undefined) return o; // added/kept only on ours' side
    if (eq(o, t)) return o;
    if (a !== undefined && eq(a, o)) return t; // only theirs changed it
    if (a !== undefined && eq(a, t)) return o; // only ours changed it
    return mergeValue(a, o, t); // both changed — merge deeper (e.g. status + results)
  }).filter(Boolean);
};

const mergeObject = (ancestor, ours, theirs) => {
  const keys = new Set([...Object.keys(ancestor || {}), ...Object.keys(ours || {}), ...Object.keys(theirs || {})]);
  const result = {};
  for (const k of keys) {
    const a = ancestor?.[k];
    const o = ours?.[k];
    const t = theirs?.[k];
    if (o === undefined) { if (t !== undefined) result[k] = t; continue; }
    if (t === undefined) { result[k] = o; continue; }
    result[k] = mergeValue(a, o, t);
  }
  return result;
};

const mergeValue = (a, o, t) => {
  if (eq(o, t)) return o;
  if (a !== undefined && eq(a, o)) return t;
  if (a !== undefined && eq(a, t)) return o;
  if (Array.isArray(o) && Array.isArray(t)) return mergeArray(Array.isArray(a) ? a : [], o, t);
  if (o && t && typeof o === 'object' && typeof t === 'object' && !Array.isArray(o) && !Array.isArray(t)) {
    return mergeObject(a && typeof a === 'object' ? a : {}, o, t);
  }
  // Scalar changed on both sides (e.g. lastIndex bumped by both runs) — remote wins,
  // next run re-derives it either way, so no real data loss.
  return t;
};

const [, , ancestorPath, oursPath, theirsPath] = process.argv;
const ancestor = fs.existsSync(ancestorPath) ? readJSON(ancestorPath) : (Array.isArray(readJSON(oursPath)) ? [] : {});
const ours = readJSON(oursPath);
const theirs = readJSON(theirsPath);

const merged = mergeValue(ancestor, ours, theirs);
fs.writeFileSync(oursPath, `${JSON.stringify(merged, null, 2)}\n`);
process.exit(0);
