// 2026-11-07 사고(Pixabay 검색어 100자 초과로 400 에러, 긴 rawQuery가 관련성을
// 흐려 후보가 거의 안 뜨던 문제) 재발 방지 테스트.
// 실제 네트워크를 타지 않도록 axios.get을 가짜로 바꿔 보낸 query 파라미터만 검증한다.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const Module = require('module');

const axiosPath = require.resolve('axios');
const mockAxios = (impl) => {
  const mod = new Module(axiosPath);
  mod.exports = { get: impl };
  require.cache[axiosPath] = mod;
};

const LONG_TOPIC = 'Bus travel inside Korean cities: color codes, tag-off transfers, and why you must flag the bus';

test('pixabay: 긴 주제 제목이어도 검색어가 100자를 넘지 않는다', async () => {
  let sentQuery = null;
  mockAxios(async (url, opts) => {
    sentQuery = opts.params.q;
    return { data: { hits: [] } };
  });
  delete require.cache[require.resolve('./pixabay_video')];
  const { findKoreaVideoPixabay } = require('./pixabay_video');

  await findKoreaVideoPixabay('fake-key', LONG_TOPIC, []);

  assert.ok(sentQuery, '검색어가 전달돼야 한다');
  assert.ok(sentQuery.length <= 100, `100자 이하여야 하는데 ${sentQuery.length}자: ${sentQuery}`);
  assert.match(sentQuery, /south korea/);
});

test('pexels: 짧은 키워드 기반 검색어를 쓴다(원문 전체를 그대로 붙이지 않는다)', async () => {
  let sentQuery = null;
  mockAxios(async (url, opts) => {
    sentQuery = opts.params.query;
    return { data: { videos: [] } };
  });
  delete require.cache[require.resolve('./pexels_video')];
  const { findKoreaVideo } = require('./pexels_video');

  await findKoreaVideo('fake-key', LONG_TOPIC, []);

  assert.ok(sentQuery, '검색어가 전달돼야 한다');
  assert.ok(sentQuery.length < LONG_TOPIC.length, '원문 전체보다는 짧아야 한다');
  assert.ok(!sentQuery.includes(':'), '콜론 같은 구두점이 검색어에 남아있으면 안 된다');
});

test('coverr: 짧은 키워드 기반 검색어를 쓰고 x-api-key 헤더로 인증한다', async () => {
  let sentQuery = null;
  let sentHeaders = null;
  let sentUrls = null;
  mockAxios(async (url, opts) => {
    sentQuery = opts.params.query;
    sentHeaders = opts.headers;
    sentUrls = opts.params.urls;
    return { data: { hits: [] } };
  });
  delete require.cache[require.resolve('./coverr_video')];
  const { findKoreaVideoCoverr } = require('./coverr_video');

  await findKoreaVideoCoverr('fake-key', LONG_TOPIC, []);

  assert.ok(sentQuery, '검색어가 전달돼야 한다');
  assert.ok(sentQuery.length < LONG_TOPIC.length, '원문 전체보다는 짧아야 한다');
  assert.equal(sentHeaders['x-api-key'], 'fake-key', 'x-api-key 헤더로 인증해야 한다');
  assert.equal(sentUrls, true, 'urls=true를 줘야 mp4 주소가 응답에 포함된다');
});

test('coverr: apiKey가 없으면 네트워크 호출 없이 null을 반환한다', async () => {
  let called = false;
  mockAxios(async () => { called = true; return { data: { hits: [] } }; });
  delete require.cache[require.resolve('./coverr_video')];
  const { findKoreaVideoCoverr } = require('./coverr_video');

  const result = await findKoreaVideoCoverr(undefined, LONG_TOPIC, []);

  assert.equal(result, null);
  assert.equal(called, false, 'API 키 없으면 호출 자체를 하면 안 된다');
});
