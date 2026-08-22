#!/usr/bin/env node
// 매일 1회 실행되는 완전 자동 파이프라인.
// 사람의 승인 없이: 다음 주제 선택 -> 주제에 맞는 실사 이미지 확보 -> 큐레이션 -> 발행 큐 등록.
// 실제 발행은 scheduler.yml(15분 간격)이 이어서 처리합니다.
require('dotenv').config();
const log = require('../lib/logger');
const { fetchKoreaTravelTopics } = require('../lib/ingestion/korea_travel');
const { fetchTopicImage } = require('../lib/ingestion/pexels_image');
const { TOPIC_IMAGES } = require('../lib/ingestion/topic_images');
const { pickNextTopic } = require('../lib/scheduler/topic_rotation');
const { curateContent } = require('../lib/curation/curate');
const { addPost } = require('../lib/scheduler/queue');

const PLATFORMS = ['threads', 'facebook'];

const resolveImage = async (topic) => {
  const live = await fetchTopicImage(topic);
  if (live) return live;
  if (TOPIC_IMAGES[topic]) {
    log.warn(`Pexels 실패 → 기존 대표 이미지로 대체: ${topic}`);
    return TOPIC_IMAGES[topic];
  }
  log.warn(`이미지 없이 텍스트만 발행합니다: ${topic}`);
  return null;
};

const main = async () => {
  log.section('Land in Korea 일일 자동 발행');

  const topics = await fetchKoreaTravelTopics();
  const item = pickNextTopic(topics);
  log.ok(`오늘의 주제: ${item.source}`);

  const imageUrl = await resolveImage(item.source);
  const curated = await curateContent(item, PLATFORMS);

  for (const platform of PLATFORMS) {
    const queued = addPost({
      text: curated[platform],
      imageUrl,
      platforms: [platform]
    });
    log.ok(`[${platform}] 큐 등록 완료: ${queued.id}`);
  }

  log.ok('일일 자동 발행 준비 완료. 다음 스케줄러 실행 시 실제 발행됩니다.');
};

main().catch((err) => {
  log.err(`일일 자동 발행 실패: ${err.message}`);
  process.exit(1);
});
