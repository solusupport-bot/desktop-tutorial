#!/usr/bin/env node
// 매일 1회 실행되는 완전 자동 파이프라인.
// 사람의 승인 없이: 오늘의 주제 3개 선택 -> 중복되지 않는 실사 이미지 확보
// -> 플랫폼별 재가공(Facebook엔 같은 주제의 블로그 글 링크 포함 — topic_blog_links.json이
// 주제<->블로그 글 slug를 관리하고, sync-blog-posts.js가 매일 빠진 글을 채웁니다)
// -> 24시간 안에서 플랫폼마다 다른 랜덤 시간으로 발행 큐 등록.
// 실제 발행은 scheduler.yml(15분 간격)이 예약 시각이 된 항목을 이어서 처리합니다.
require('dotenv').config();
const log = require('../lib/logger');
const { fetchKoreaTravelTopics } = require('../lib/ingestion/korea_travel');
const { fetchTopicImages } = require('../lib/ingestion/pexels_image');
const { findKoreaVideo } = require('../lib/ingestion/pexels_video');
const { TOPIC_IMAGES } = require('../lib/ingestion/topic_images');
const { watermarkAndHostImages } = require('../lib/media/watermark_images');
const {
  pickNextTopic, getRecentImageUrls, recordImageUrl, getRecentVideoUrls, recordVideoUrl
} = require('../lib/scheduler/topic_rotation');
const { curateContent } = require('../lib/curation/curate');
const { addPost } = require('../lib/scheduler/queue');
const { getBlogLinkForTopic, withUtm, BLOG_HOME_URL } = require('../lib/ingestion/topic_blog_links');

// Instagram 카드뉴스(9슬라이드 디자인, CARD_DESIGN_SPEC.md)는 아직 실제로 만들어지지
// 않았지만, 계정 자체 인사이트 데이터(단일 이미지 1~4회 노출 vs 영상 42~110회 노출)와
// 2026년 실측 알고리즘 데이터(Reels가 단일 이미지 대비 reach 2.25x)가 일치해서, 카드뉴스
// 디자인을 기다리지 않고 Reels(영상) 우선으로 먼저 활성화합니다. 카드뉴스는 저장/참여용
// 포맷으로 나중에 별도 추가 예정 — Reels가 없는 주제만 이미지 캐로셀로 대체 발행됩니다.
const PLATFORMS = ['threads', 'facebook', 'instagram'];
const POSTS_PER_DAY = 3;

// 2026년 실측 데이터 기준 플랫폼별 우선순위(follower growth / engagement 데이터 근거 —
// 아래 수치는 실제 웹 검색으로 확인한 것만 적었습니다. 이전에 코드/보고에 적었던
// "Facebook Reels +135%/+3.2x"는 실제로 검색해서 나온 수치가 아니라 잘못 적었던 것이라
// 지우고 아래 검증된 수치로 교체합니다):
// - Facebook: 당일 Reels가 사진 대비 배포량 +50%, 영상 공유량은 텍스트 대비 +1200%(피크 시간대
//   게시 기준) — 영상이 신규 도달에 유리. 영상이 없으면 여러 장 앨범(사진 다건)이 텍스트 대비
//   참여도 +35%로 기존 팔로워 참여엔 여전히 강함.
//   출처: socialpilot.co/blog/facebook-algorithm, postoria.io/blog/facebook-algorithms (2026)
// - Threads: 이미지 포스트가 텍스트 전용보다 참여도 +2.3x, 이미지/영상 포함 포스트가 텍스트 전용
//   대비 3x — "영상이 항상 1순위"라는 통념과 반대로 Threads는 이미지(캐로셀)를 먼저 쓰는 게 맞음.
//   게시물 본문 내 외부 링크는 알고리즘이 도달을 억제한다(bio 링크는 예외) — 그래서 아래에서
//   Threads 본문엔 URL 대신 "link in bio" CTA만 남긴다.
// - Instagram(현재 daily-auto-post 대상 아님, 참고용): Reels가 단일 이미지보다 reach 2.25x,
//   캐로셀보다 1.36x. 반대로 캐로셀 참여율(0.52%)이 Reels(0.50%)보다 근소하게 높고 저장은 9x —
//   신규 도달=Reels, 기존 팔로워 참여/저장=캐로셀이라는 뜻.
//   출처: collabkit.me/blog/instagram-reels-vs-carousels-vs-images-data-study-2026,
//         carouselli.com/blog/instagram-carousel-engagement (2026)
// 이미지로 갈 때는 4~5장, 최근 사용 이력과 중복 없이 확보합니다.
const IMAGE_CAROUSEL_TARGET = 5;

// 실제 UTC 시각 기준 고정 윈도우입니다 — "스크립트 실행 시점" 기준 상대 오프셋이 아닙니다.
// 이전엔 baseTime = new Date()(실행 시점)에 시간을 더하는 방식이라, 크론이 지연되거나
// 같은 날 여러 번 수동 재실행되면(2026-08-29 실측 사례) 그때마다 새 윈도우가 잡혀
// 예약 시각들이 한 군데로 몰리는 문제가 있었습니다. 콘텐츠가 영어라 미국과 아시아
// 두 독자층을 다 노리도록 시간대를 섞습니다:
// - 아시아 낮 시간(한국/싱가포르/필리핀 등 UTC+8~+9 오전~정오): UTC 01:00-05:00
// - 미국 동부 업무 시간(여행 리서치 타이밍): UTC 13:00-17:00
// - 미국 동부 저녁(여행 드리밍 타임) + 아시아 심야: UTC 23:00-03:00(자정을 넘어감, 27=다음날 03시)
const DAY_WINDOWS_HOURS = [
  [1, 5],
  [13, 17],
  [23, 27]
];

/**
 * window를 "오늘 UTC 자정" 기준 고정 시각으로 해석합니다. 오늘 그 구간이 이미 다
 * 지났으면(크론 지연/수동 재실행 등으로 실행 시점이 구간을 지나친 경우) 내일로 넘겨서,
 * 실행 시점과 무관하게 항상 실제 목표 시간대에 예약되도록 합니다.
 */
const randomTimeInWindow = (now, [startH, endH]) => {
  const todayMidnightUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  let startMs = todayMidnightUTC + startH * 3600 * 1000;
  let endMs = todayMidnightUTC + endH * 3600 * 1000;
  if (endMs <= now.getTime()) {
    // 오늘 이 구간이 이미 다 지났으면 내일로 넘김
    startMs += 24 * 3600 * 1000;
    endMs += 24 * 3600 * 1000;
  } else if (startMs < now.getTime()) {
    // 지금이 구간 안이면(크론 지연 등) 과거 시각이 나오지 않도록 시작점을 지금으로 당김
    startMs = now.getTime();
  }
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
  images.forEach(recordImageUrl); // 중복 체크는 항상 원본 Pexels URL 기준 — 워터마크 자산 URL은 매번 새로 생겨 의미가 없음

  // Meta가 2026-05부터 사진/캐로셀에도 "실질적 편집 없는 재사용 콘텐츠" 단속을 확대함
  // (컴퓨터 비전 기반 구조적 유사성 탐지, 30일 10건 이상이면 추천 노출 전체 배제).
  // 무료 스톡 사진은 다른 계정들도 그대로 쓰므로, 브랜드 배지를 실제 이미지 픽셀에
  // 합성해 "그래픽 추가"라는 실질적 편집 신호를 남긴다(2026-08-29 사용자 요청).
  const watermarkedImages = await watermarkAndHostImages(images, 'solusupport-bot/desktop-tutorial', process.env.GITHUB_TOKEN);

  const videoQuery = item.source.replace(/\(.*?\)/g, '').trim();
  const video = await findKoreaVideo(process.env.PEXELS_API_KEY, videoQuery, getRecentVideoUrls());
  if (video) recordVideoUrl(video);

  const curated = await curateContent(item, PLATFORMS, seed);
  const now = new Date();
  const baseTime = randomTimeInWindow(now, window);

  // SNS는 훅/요약만, 상세 비교와 근거는 블로그가 담당하는 순환 구조입니다. 오늘 이 주제의
  // 블로그 글 slug는 topic_blog_links.json에 이미 있거나(기존 12개 주제는 다 있음),
  // 없으면 sync-blog-posts.js가 같은 daily-topic.yml 실행 안에서 새로 써서 채웁니다 —
  // 이 스크립트는 그 결과를 읽기만 하고, 매핑이 아직 없으면 블로그 홈으로 대체합니다.
  const blogUrl = withUtm(getBlogLinkForTopic(item.source), 'facebook');
  const hasSpecificPost = blogUrl !== withUtm(BLOG_HOME_URL, 'facebook');

  // 우선순위는 플랫폼마다 다릅니다(실측 데이터 근거는 파일 상단 주석 참고):
  // Facebook/Instagram = 영상(Reels) 우선(없으면 이미지 앨범/캐로셀), Threads = 이미지 우선(없으면 영상).
  // Facebook과 Instagram은 같은 video를 재사용합니다 — Pexels 쿼리를 두 번 하지 않기 위함.
  const mediaByPlatform = {
    facebook: video ? { videoUrl: video } : { imageUrls: watermarkedImages },
    threads: watermarkedImages.length > 0 ? { imageUrls: watermarkedImages } : (video ? { videoUrl: video } : {}),
    instagram: video ? { videoUrl: video } : { imageUrls: watermarkedImages }
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
    // 계정 공통이라 게시물 단위로 구분이 안 됨). Threads/Instagram bio는 landinkorea.com으로
    // 이미 연결되어 있습니다(2026-08-29 확인). Facebook은 링크 억제 이슈가 없으므로, 오늘
    // 같은 주제의 블로그 글 slug가 있으면(topic_blog_links.json) 그 구체적인 글 주소를
    // 바로 캡션에 넣어 SNS -> 블로그 -> (다시 SNS) 순환이 생기게 합니다. 아직 매핑이 없으면
    // (아직 sync-blog-posts.js가 못 채운 새 주제) 블로그 홈 링크로 대체합니다.
    let text = curated[platform];
    if (platform === 'threads') {
      text = `${text}\n\n📖 More on the blog — link in bio.`;
    } else if (platform === 'facebook') {
      text = `${text}\n\n📖 ${hasSpecificPost ? 'Full breakdown' : 'More on the blog'}: ${blogUrl}`;
    }

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
