#!/usr/bin/env node
// 매일 1회 실행되는 완전 자동 파이프라인.
// 사람의 승인 없이: 오늘의 주제 3개 선택 -> 중복되지 않는 실사 이미지 확보
// -> 플랫폼별 재가공 -> 24시간 안에서 플랫폼마다 다른 랜덤 시간으로 발행 큐 등록.
// 실제 발행은 scheduler.yml(15분 간격)이 예약 시각이 된 항목을 이어서 처리합니다.
require('dotenv').config();
const log = require('../lib/logger');
const { fetchKoreaTravelTopics } = require('../lib/ingestion/korea_travel');
const { fetchTopicImages } = require('../lib/ingestion/pexels_image');
const { findKoreaVideo } = require('../lib/ingestion/pexels_video');
const { TOPIC_IMAGES } = require('../lib/ingestion/topic_images');
const {
  pickNextTopic, getRecentImageUrls, recordImageUrl, getRecentVideoUrls, recordVideoUrl
} = require('../lib/scheduler/topic_rotation');
const { curateContent } = require('../lib/curation/curate');
const { addPost } = require('../lib/scheduler/queue');

// Instagram 카드뉴스(9슬라이드 디자인, CARD_DESIGN_SPEC.md)는 아직 실제로 만들어지지
// 않았습니다 — 이번 변경으로 만든 실사진 캐로셀 발행 기능(instagram.js)은 카드뉴스와
// 별개이니, 디자인된 카드뉴스가 나오기 전까지는 Instagram을 여기 넣지 않습니다.
const PLATFORMS = ['threads', 'facebook'];
const POSTS_PER_DAY = 3;

// 2026년 실측 데이터 기준 플랫폼별 우선순위(follower growth / engagement 데이터 근거):
// - Facebook: Reels가 사진 대비 reach +135%, 오리지널 영상은 +3.2x — 영상이 신규 도달에 압도적으로 유리.
//   영상이 없으면 여러 장 앨범(사진 다건)이 기존 팔로워 참여율은 여전히 가장 높음.
// - Threads: 실제로는 이미지 포스트가 텍스트 전용보다 참여도 +2.3x, 영상보다도 데이터상 우위 —
//   "영상이 항상 1순위"라는 통념과 반대로 Threads는 이미지(캐로셀)를 먼저 쓰는 게 맞음.
// 두 플랫폼 다 이미지는 4~5장, 최근 사용 이력과 중복 없이 확보합니다.
const IMAGE_CAROUSEL_TARGET = 5;

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

const withPlatformJitter = (time) => new Date(time.getTime() + (Math.random() * 90 - 45) * 60 * 1000);

/**
 * 실사 이미지를 최대 count장까지 중복 없이 확보합니다(기본 목표 5장 — 2026년 실측 데이터
 * 기준 Facebook 앨범/Threads 캐로셀 모두 사진 여러 장이 참여율에 가장 유리하다는 근거).
 * Pexels에서 하나도 못 구하면 과거의 고정 대표 이미지 1장으로 대체하고, 그마저 최근에
 * 이미 쓴 것이면 중복을 감수하고 씁니다(이미지 없이 텍스트만 발행하는 것보다는 낫다는 판단).
 */
const resolveImages = async (topicName, seed, count) => {
  const recent = getRecentImageUrls();
  const live = await fetchTopicImages(topicName, recent, seed, count);
  if (live.length > 0) return live;

  const fallback = TOPIC_IMAGES[topicName];
  if (!fallback) {
    log.warn(`이미지를 하나도 못 구했습니다: ${topicName}`);
    return [];
  }
  if (recent.includes(fallback)) {
    log.warn(`기존 대표 이미지도 최근에 이미 사용됨 → 중복을 감수하고 사용: ${topicName}`);
  } else {
    log.warn(`Pexels 실패 → 기존 대표 이미지로 대체: ${topicName}`);
  }
  return [fallback];
};

const queueOneTopic = async (topics, window) => {
  const { topic: item, seed } = pickNextTopic(topics);
  log.ok(`주제 선택: ${item.source} (구간 ${window[0]}~${window[1]}시)`);

  const images = await resolveImages(item.source, seed, IMAGE_CAROUSEL_TARGET);
  images.forEach(recordImageUrl);

  const videoQuery = item.source.replace(/\(.*?\)/g, '').trim();
  const video = await findKoreaVideo(process.env.PEXELS_API_KEY, videoQuery, getRecentVideoUrls());
  if (video) recordVideoUrl(video);

  const curated = await curateContent(item, PLATFORMS, seed);
  const now = new Date();
  const baseTime = randomTimeInWindow(now, window);

  // 우선순위는 플랫폼마다 다릅니다(실측 데이터 근거는 파일 상단 주석 참고):
  // Facebook = 영상 우선(없으면 이미지 앨범), Threads = 이미지 우선(없으면 영상).
  const mediaByPlatform = {
    facebook: video ? { videoUrl: video } : { imageUrls: images },
    threads: images.length > 0 ? { imageUrls: images } : (video ? { videoUrl: video } : {})
  };

  for (const platform of PLATFORMS) {
    const media = mediaByPlatform[platform] || {};
    if (!(media.imageUrls && media.imageUrls.length) && !media.videoUrl) {
      log.warn(`[${platform}] 사용할 미디어가 없어 큐 등록을 건너뜁니다: ${item.source}`);
      continue;
    }

    const scheduledAt = withPlatformJitter(baseTime).toISOString();
    // Threads 본문에 실제 URL을 넣으면 Threads 알고리즘이 그 포스트의 도달을 적극적으로
    // 억제한다(2026년 실측 — bio 링크는 예외). 그래서 본문엔 URL 대신 "링크는 bio에"
    // CTA만 남긴다 — 트레이드오프로 플랫폼별 UTM 클릭 추적은 더 이상 안 된다(bio 링크는
    // 계정 공통이라 게시물 단위로 구분이 안 됨). Threads 프로필 bio에 블로그 링크가 실제로
    // 걸려있는지는 별도로 확인 필요.
    const text = platform === 'threads'
      ? `${curated[platform]}\n\n📖 More on the blog — link in bio.`
      : curated[platform];

    const queued = addPost({
      text,
      imageUrls: media.imageUrls,
      videoUrl: media.videoUrl,
      platforms: [platform],
      scheduledAt
    });
    const mediaLabel = media.videoUrl
      ? '영상'
      : media.imageUrls.length > 1 ? `이미지 ${media.imageUrls.length}장` : '단일 이미지';
    log.ok(`[${platform}] 큐 등록: ${queued.id} (예약 ${scheduledAt}, ${mediaLabel})`);
  }
};

const main = async () => {
  log.section(`Land in Korea 일일 자동 발행 (하루 ${POSTS_PER_DAY}건, 24시간 랜덤 분산)`);

  const topics = await fetchKoreaTravelTopics();
  for (let i = 0; i < POSTS_PER_DAY; i += 1) {
    await queueOneTopic(topics, DAY_WINDOWS_HOURS[i % DAY_WINDOWS_HOURS.length]);
  }

  log.ok(`오늘 ${POSTS_PER_DAY}개 주제를 ${PLATFORMS.join(', ')} 채널에 하루 안에서 랜덤 시각으로 예약했습니다.`);
};

main().catch((err) => {
  log.err(`일일 자동 발행 실패: ${err.message}`);
  process.exit(1);
});
