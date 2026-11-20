// 2026-11-20: Instagram에 외국 영상이 나간 사고의 회귀 테스트.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const axios = require('axios');
const { findKoreaVideo } = require('./pexels_video');
const { findKoreaVideoPixabay } = require('./pixabay_video');
const { parseVerdict } = require('./media_guard');

const pexelsVideo = (id, slug) => ({
  url: `https://www.pexels.com/video/${slug}-${id}/`,
  video_files: [{ file_type: 'video/mp4', width: 1920, height: 1080, link: `https://videos.pexels.com/video-files/${id}/${id}-hd.mp4` }]
});

const withGet = async (impl, fn) => {
  const orig = axios.get;
  axios.get = impl;
  try { return await fn(); } finally { axios.get = orig; }
};

test('Pexels: a topic match without any Korea place name is no longer accepted', async () => {
  const videos = [pexelsVideo(1, 'people-waiting-for-a-green-city-bus')];
  const got = await withGet(async () => ({ data: { videos } }), () => findKoreaVideo('k', 'Bus travel city bus'));
  assert.equal(got, null);
});

test('Pexels: a video whose slug names Korea is still accepted', async () => {
  const videos = [pexelsVideo(1, 'people-waiting-for-a-green-city-bus'), pexelsVideo(2, 'travel-by-city-bus-in-seoul')];
  const got = await withGet(async () => ({ data: { videos } }), () => findKoreaVideo('k', 'Bus travel city bus'));
  assert.match(got, /\/2\//);
});

test('Pixabay: tags without a Korea place name are no longer accepted', async () => {
  const hits = [{ tags: 'bus, city, street, people', pageURL: 'p', videos: { large: { url: 'https://cdn.pixabay.com/video/x.mp4', width: 1920 } } }];
  const got = await withGet(async () => ({ data: { hits } }), () => findKoreaVideoPixabay('k', 'city bus street'));
  assert.equal(got, null);
});

test('vision verdict that calls the scene foreign is rejected even with korea=true', () => {
  const text = JSON.stringify({ korea: true, topic: true, what: 'A bus with people on it in a foreign country.' });
  assert.equal(parseVerdict(text, 'u', 'Bus travel', 'test'), false);
  const jp = JSON.stringify({ korea: true, topic: true, what: 'A street in Tokyo with neon signs' });
  assert.equal(parseVerdict(jp, 'u', 'Nightlife', 'test'), false);
  const ok = JSON.stringify({ korea: true, topic: true, what: 'A laundromat in South Korea' });
  assert.equal(parseVerdict(ok, 'u', 'Laundry', 'test'), true);
});
