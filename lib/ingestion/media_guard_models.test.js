// 2026-11-23: Workers AI 비전 모델 폐기 자동 대응 테스트 (네트워크 없이 axios.get 모킹)
const test = require('node:test');
const assert = require('node:assert');
const axios = require('axios');
const { _test } = require('./media_guard');

const withCatalog = async (models, fn) => {
  const orig = axios.get;
  axios.get = async () => ({ data: { result: models } });
  _test.resetCatalog();
  try { await fn(); } finally { axios.get = orig; _test.resetCatalog(); }
};
const vision = (name, extra = []) => ({ name, task: { name: 'Text Generation' }, properties: [{ property_id: 'vision', value: 'true' }, ...extra] });

test('지정 모델이 살아 있으면 지정 모델이 먼저', async () => {
  await withCatalog([vision('@cf/google/gemma-4-26b-a4b-it'), vision('@cf/moondream/moondream3.1-9B-A2B'), vision('@cf/other/new-vision')], async () => {
    const list = await _test.pickCloudflareModels('t', 'a');
    assert.deepStrictEqual(list.slice(0, 2), ['@cf/google/gemma-4-26b-a4b-it', '@cf/moondream/moondream3.1-9B-A2B']);
  });
});

test('지정 모델이 목록에서 사라지거나 30일 안에 폐기 예정이면 다른 비전 모델로 자동 전환', async () => {
  const soon = new Date(Date.now() + 5 * 86400000).toISOString();
  await withCatalog([
    vision('@cf/moondream/moondream3.1-9B-A2B', [{ property_id: 'planned_deprecation_date', value: soon }]),
    vision('@cf/meta/llama-3.2-11b-vision-instruct'),
    vision('@cf/acme/future-vision'),
    { name: '@cf/acme/text-only', task: { name: 'Text Generation' }, properties: [] }
  ], async () => {
    const list = await _test.pickCloudflareModels('t', 'a');
    assert.deepStrictEqual(list, ['@cf/acme/future-vision']);
  });
});

test('목록 조회 실패 시 지정 모델 그대로', async () => {
  const orig = axios.get;
  axios.get = async () => { throw new Error('network'); };
  _test.resetCatalog();
  try {
    const list = await _test.pickCloudflareModels('t', 'a');
    assert.ok(list.includes('@cf/google/gemma-4-26b-a4b-it'));
  } finally { axios.get = orig; _test.resetCatalog(); }
});
