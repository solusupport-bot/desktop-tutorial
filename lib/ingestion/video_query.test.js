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

// 2026-11-09 사고 재발 방지: KOREA_SIGNAL이 "korea|korean|seoul|incheon|busan|hanok|
// k-pop" 7단어뿐이던 시절, Pexels 슬러그가 "hwaseong-fortress-water-gate"처럼 실제
// 한국 지명을 담고 있어도 그 7단어가 없으면 전부 탈락해 인스타그램이 5일간
// "영상 없음"으로 막혔다. topic_match.js의 공용 KOREA_SIGNAL로 통합하면서 지명을
// 넓혔는데, 이 테스트는 그 지명이 실제로 통과하는지 확인한다(매칭 강도는 그대로:
// "suwon hwaseong fortress korea wall walk" 쿼리에서 suwon/hwaseong/fortress/wall/walk
// 중 2개 이상 겹쳐야 통과 — slug에 hwaseong+fortress 2개가 들어 있어 기준을 안 낮춤).
test('pexels: KOREA_SIGNAL 목록에 없던 지명(hwaseong)도 슬러그에 있으면 통과한다', async () => {
  mockAxios(async () => ({
    data: {
      videos: [{
        url: 'https://www.pexels.com/video/serene-view-of-hwaseong-fortress-water-gate-40553582/',
        video_files: [{ file_type: 'video/mp4', width: 1920, height: 1080, link: 'https://videos.pexels.com/video-files/40553582/x.mp4' }]
      }]
    }
  }));
  delete require.cache[require.resolve('./pexels_video')];
  const { findKoreaVideo } = require('./pexels_video');

  const result = await findKoreaVideo('fake-key', 'suwon hwaseong fortress korea wall walk', []);

  assert.equal(result, 'https://videos.pexels.com/video-files/40553582/x.mp4');
});

test('vimeo: accessToken이 없으면 네트워크 호출 없이 null을 반환한다', async () => {
  let called = false;
  mockAxios(async () => { called = true; return { data: { data: [] } }; });
  delete require.cache[require.resolve('./vimeo_video')];
  const { findKoreaVideoVimeo } = require('./vimeo_video');

  const result = await findKoreaVideoVimeo(undefined, LONG_TOPIC, []);

  assert.equal(result, null);
  assert.equal(called, false, 'access token 없으면 호출 자체를 하면 안 된다');
});

test('vimeo: Bearer 토큰으로 인증하고 CC 라이선스만 검색한다', async () => {
  let sentHeaders = null;
  let sentParams = null;
  mockAxios(async (url, opts) => {
    sentHeaders = opts.headers;
    sentParams = opts.params;
    return { data: { data: [] } };
  });
  delete require.cache[require.resolve('./vimeo_video')];
  const { findKoreaVideoVimeo } = require('./vimeo_video');

  await findKoreaVideoVimeo('fake-token', LONG_TOPIC, []);

  assert.equal(sentHeaders.Authorization, 'Bearer fake-token');
  assert.equal(sentParams.filter, 'CC', 'CC 라이선스로 저작권 리스크를 줄여야 한다');
});

test('vimeo: 다운로드 파일이 없는(files 비어있는) 영상은 건너뛴다', async () => {
  mockAxios(async () => ({
    data: {
      data: [
        { name: 'seoul korea street', files: [], tags: [] },
        {
          name: 'seoul korea bus travel',
          files: [{ type: 'video/mp4', width: 1920, link: 'https://vimeo.com/x/y.mp4' }],
          tags: []
        }
      ]
    }
  }));
  delete require.cache[require.resolve('./vimeo_video')];
  const { findKoreaVideoVimeo } = require('./vimeo_video');

  const result = await findKoreaVideoVimeo('fake-token', 'bus travel korea', []);

  assert.equal(result, 'https://vimeo.com/x/y.mp4');
});
