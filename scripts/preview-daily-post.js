#!/usr/bin/env node
// daily-auto-post.js가 "오늘" 무엇을 만들지 미리 보여주는 전용 스크립트.
// 큐(data/queue.json)나 주제 순환 상태(data/topic_state.json)를 전혀 건드리지 않습니다.
require('dotenv').config();
const log = require('../lib/logger');
const { fetchKoreaTravelTopics } = require('../lib/ingestion/korea_travel');
const { fetchTopicImages } = require('../lib/ingestion/pexels_image');
const { findKoreaVideo } = require('../lib/ingestion/pexels_video');
const { TOPIC_IMAGES } = require('../lib/ingestion/topic_images');
const { loadState, getRecentImageUrls, getRecentVideoUrls } = require('../lib/scheduler/topic_rotation');
const { curateContent } = require('../lib/curation/curate');

const PLATFORMS = ['threads', 'facebook'];
const IMAGE_CAROUSEL_TARGET = 5;

const pickAngle = (content, seed) => (Array.isArray(content) ? content[seed % content.length] : content);

const resolveImages = async (topicName, seed) => {
  const recent = getRecentImageUrls();
  const live = await fetchTopicImages(topicName, recent, seed, IMAGE_CAROUSEL_TARGET);
  if (live.length > 0) return { urls: live, source: `Pexels 실시간 ${live.length}장 (고화질/중복 회피 적용)` };
  if (TOPIC_IMAGES[topicName]) return { urls: [TOPIC_IMAGES[topicName]], source: '기존 대표 이미지 (최후 폴백, 1장)' };
  return { urls: [], source: '없음' };
};

const main = async () => {
  log.section('오늘의 자동 발행 미리보기 (큐/상태를 저장하지 않음)');

  const topics = await fetchKoreaTravelTopics();
  const state = loadState();
  const nextIndex = (state.lastIndex + 1) % topics.length;
  const seed = state.history.length;
  const item = { ...topics[nextIndex], content: pickAngle(topics[nextIndex].content, seed) };

  const images = await resolveImages(item.source, seed);
  const videoQuery = item.source.replace(/\(.*?\)/g, '').trim();
  const video = await findKoreaVideo(process.env.PEXELS_API_KEY, videoQuery, getRecentVideoUrls());
  const curated = await curateContent(item, PLATFORMS, seed);

  // Facebook = 영상 우선(없으면 이미지 앨범), Threads = 이미지 우선(없으면 영상) — daily-auto-post.js와 동일한 규칙.
  const mediaSummary = (platform) => {
    if (platform === 'facebook') return video ? `영상 (${video})` : `${images.source} — ${images.urls.join(', ') || '없음'}`;
    return images.urls.length > 0 ? `${images.source} — ${images.urls.join(', ')}` : (video ? `영상 폴백 (${video})` : '없음');
  };

  console.log('\n════════════════════════════════════════════════');
  console.log(`주제: ${item.source}`);
  console.log(`출처: ${item.url}`);
  console.log(`[facebook] 미디어: ${mediaSummary('facebook')}`);
  console.log(`[threads]  미디어: ${mediaSummary('threads')}`);
  console.log('════════════════════════════════════════════════');
  PLATFORMS.forEach((p) => {
    console.log(`\n[${p}]\n${curated[p]}`);
  });
  console.log('\n════════════════════════════════════════════════');
  console.log('※ 이 실행은 큐에 등록되지 않았습니다. 실제 자동 발행은 매일 00:00 UTC(KST 09:00)에 이 내용과 같은 방식으로 자동 진행됩니다.');
};

main().catch((err) => {
  log.err(`미리보기 실패: ${err.message}`);
  process.exit(1);
});
