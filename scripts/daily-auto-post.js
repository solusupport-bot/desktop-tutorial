#!/usr/bin/env node
// 매일 1회 실행되는 완전 자동 파이프라인.
// 사람의 승인 없이: 오늘의 주제 3개 선택 -> 중복되지 않는 실사 이미지 확보
// -> 플랫폼별 재가공 -> 24시간 안에서 플랫폼마다 다른 랜덤 시간으로 발행 큐 등록.
// 실제 발행은 scheduler.yml(15분 간격)이 예약 시각이 된 항목을 이어서 처리합니다.
require('dotenv').config();
const log = require('../lib/logger');
const { fetchKoreaTravelTopics } = require('../lib/ingestion/korea_travel');
const { fetchTopicImage } = require('../lib/ingestion/pexels_image');
const { TOPIC_IMAGES } = require('../lib/ingestion/topic_images');
const { pickNextTopic, getRecentImageUrls, recordImageUrl } = require('../lib/scheduler/topic_rotation');
const { curateContent } = require('../lib/curation/curate');
const { addPost } = require('../lib/scheduler/queue');

const PLATFORMS = ['threads', 'facebook']; // Instagram 추가 시 이미지 그대로 재사용 예정 (카드뉴스 전환은 별도 작업)
const POSTS_PER_DAY = 3;

// 하루(24시간)를 3구간으로 나눠 각 구간에서 하나씩 랜덤 시각을 뽑습니다.
// 완전 무작위로만 뽑으면 우연히 다 몰릴 수 있어, 최소한의 분산을 보장합니다.
const DAY_WINDOWS_HOURS = [
  [0, 8],
  [8, 16],
  [16, 24]
];

const randomTimeInWindow = (baseTime, [startH, endH]) => {
  const startMs = baseTime.getTime() + startH * 3600 * 1000;
  const endMs = baseTime.getTime() + endH * 3600 * 1000;
  return new Date(startMs + Math.random() * (endMs - startMs));
};

// 같은 주제라도 플랫폼마다 발행 시각을 다르게 만들기 위한 지터(최대 ±45분).
const withPlatformJitter = (time) => new Date(time.getTime() + (Math.random() * 90 - 45) * 60 * 1000);

const resolveImage = async (topicName, seed) => {
  const recent = getRecentImageUrls();
  const live = await fetchTopicImage(topicName, recent, seed);
  if (live) return live;

  const fallback = TOPIC_IMAGES[topicName];
  if (fallback && !recent.includes(fallback)) {
    log.warn(`Pexels 실패 → 기존 대표 이미지로 대체: ${topicName}`);
    return fallback;
  }
  if (fallback) {
    log.warn(`기존 대표 이미지도 최근에 이미 사용됨 → 중복을 감수하고 사용: ${topicName}`);
    return fallback;
  }
  log.warn(`이미지 없이 텍스트만 발행합니다: ${topicName}`);
  return null;
};

const queueOneTopic = async (topics, window) => {
  const { topic: item, seed } = pickNextTopic(topics);
  log.ok(`주제 선택: ${item.source} (구간 ${window[0]}~${window[1]}시)`);

  const imageUrl = await resolveImage(item.source, seed);
  if (imageUrl) recordImageUrl(imageUrl);

  const curated = await curateContent(item, PLATFORMS, seed);
  const now = new Date();
  const baseTime = randomTimeInWindow(now, window);

  for (const platform of PLATFORMS) {
    const scheduledAt = withPlatformJitter(baseTime).toISOString();
    const queued = addPost({
      text: curated[platform],
      imageUrl,
      platforms: [platform],
      scheduledAt
    });
    log.ok(`[${platform}] 큐 등록: ${queued.id} (예약 ${scheduledAt})`);
  }
};

const main = async () => {
  log.section(`Land in Korea 일일 자동 발행 (하루 ${POSTS_PER_DAY}건, 24시간 랜덤 분산)`);

  const topics = await fetchKoreaTravelTopics();
  for (let i = 0; i < POSTS_PER_DAY; i += 1) {
    await queueOneTopic(topics, DAY_WINDOWS_HOURS[i % DAY_WINDOWS_HOURS.length]);
  }

  log.ok(`오늘 ${POSTS_PER_DAY}개 주제(플랫폼별 총 ${POSTS_PER_DAY * PLATFORMS.length}건)가 하루 안에서 랜덤 시각으로 예약되었습니다.`);
};

main().catch((err) => {
  log.err(`일일 자동 발행 실패: ${err.message}`);
  process.exit(1);
});
