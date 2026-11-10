// 2026-11-10 회귀 테스트: 같은 주제에 같은 작가의 burst 사진(ID만 다른 사실상 동일 사진)이
// 반복 채택되던 버그 재발 방지. axios/topic_rotation을 가짜 모듈로 올려 실제 네트워크나
// data/topic_state.json을 건드리지 않는다.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const Module = require('module');

const axiosPath = require.resolve('axios');
const topicRotationPath = require.resolve('../scheduler/topic_rotation');
const pexelsImagePath = require.resolve('./pexels_image');

const mockModule = (resolvedPath, exportsObj) => {
  const mod = new Module(resolvedPath);
  mod.exports = exportsObj;
  mod.loaded = true;
  require.cache[resolvedPath] = mod;
};

const photo = (id, photographer) => ({
  width: 3000,
  alt: 'A scenic view in Seoul, South Korea',
  url: `https://www.pexels.com/photo/seoul-korea-${id}/`,
  photographer,
  src: { large2x: `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg` }
});

const loadPexelsImageWithMocks = ({ photos, recordedPhotographers = {} }) => {
  delete require.cache[pexelsImagePath];
  mockModule(axiosPath, { get: async () => ({ data: { photos } }) });
  mockModule(topicRotationPath, {
    getTopicPhotographers: (topic) => recordedPhotographers[topic] || [],
    recordTopicPhotographer: (topic, p) => {
      recordedPhotographers[topic] = recordedPhotographers[topic] || [];
      if (!recordedPhotographers[topic].includes(p)) recordedPhotographers[topic].push(p);
    }
  });
  return require('./pexels_image');
};

test('findKoreaPhoto는 excludePhotographers로 지정된 작가의 사진을 건너뛴다', async () => {
  const photos = [photo(111, 'Burst Photographer'), photo(222, 'Other Photographer')];
  const { findKoreaPhoto } = loadPexelsImageWithMocks({ photos });

  const url = await findKoreaPhoto('fake-key', 'n seoul tower', [], ['Burst Photographer']);

  assert.equal(url, photos[1].src.large2x);
});

test('fetchTopicImage는 같은 주제에서 이미 쓴 작가의 사진을 다시 고르지 않고, 새로 고른 작가를 기록한다', async () => {
  const photos = [photo(111, 'Burst Photographer'), photo(222, 'Other Photographer')];
  const recordedPhotographers = { 'N Seoul Tower (Namsan)': ['Burst Photographer'] };
  const { fetchTopicImage } = loadPexelsImageWithMocks({ photos, recordedPhotographers });

  process.env.PEXELS_API_KEY = 'fake-key';
  const url = await fetchTopicImage('N Seoul Tower (Namsan)', [], 0);

  assert.equal(url, photos[1].src.large2x);
  assert.deepEqual(recordedPhotographers['N Seoul Tower (Namsan)'], ['Burst Photographer', 'Other Photographer']);
});

test('fetchTopicImages는 한 호출 안에서도 같은 작가의 burst 컷 두 장을 같이 고르지 않는다', async () => {
  const photos = [photo(111, 'Burst Photographer'), photo(222, 'Burst Photographer'), photo(333, 'Other Photographer')];
  const { fetchTopicImages } = loadPexelsImageWithMocks({ photos });

  process.env.PEXELS_API_KEY = 'fake-key';
  const urls = await fetchTopicImages('N Seoul Tower (Namsan)', [], 0, 2);

  // 1장은 Burst Photographer(111), 2장째는 같은 작가(222)를 건너뛰고 Other Photographer(333)여야 한다.
  assert.deepEqual(urls, [photos[0].src.large2x, photos[2].src.large2x]);
});
