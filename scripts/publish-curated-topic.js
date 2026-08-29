#!/usr/bin/env node
// 실제 큐레이션 파이프라인(curateContent + Threads 캐로셀)을 그대로 써서
// 한 주제를 Threads/Facebook/Instagram에 "즉시" 발행하는 테스트 스크립트.
//
// 표준 규칙(앞으로도 적용):
// - 각 플랫폼은 curate.js의 PLATFORM_GUIDE에 따라 서로 다른 글로 재가공된다
//   (동일 문구를 3개 채널에 복붙하지 않는다).
// - Threads는 벤치마킹한 고성과 게시물 구조를 따른다: 구체적 숫자/지명이 훅으로
//   오고(pickHookSentence), 이미지 2장을 캐로셀로 올려 2번째 장으로 스와이프하게
//   만든다(fetchTopicImages).
require('dotenv').config();
const log = require('../lib/logger');
const { fetchKoreaTravelTopics } = require('../lib/ingestion/korea_travel');
const { curateContent } = require('../lib/curation/curate');
const { fetchTopicImages } = require('../lib/ingestion/pexels_image');
const { findKoreaVideo } = require('../lib/ingestion/pexels_video');
const { findPopularMusic } = require('../lib/ingestion/jamendo_music');
const { attachMusicToVideo, cleanupMergedVideo } = require('../lib/media/mix_audio');
const { uploadMergedVideoAsset } = require('../lib/publishing/github_asset_host');
const { PLATFORMS } = require('../lib/publishing');
const { getPermalink } = require('../lib/publishing/permalink');
const { getBlogLinkForTopic, withUtm } = require('../lib/ingestion/topic_blog_links');
const {
  getRecentImageUrls, recordImageUrl, getRecentVideoUrls, recordVideoUrl,
  getRecentMusicUrls, recordMusicUrl
} = require('../lib/scheduler/topic_rotation');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const parseArgs = () => {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i += 2) {
    opts[args[i].replace(/^--/, '')] = args[i + 1];
  }
  return opts;
};

const main = async () => {
  const opts = parseArgs();
  const topics = await fetchKoreaTravelTopics();
  const topicName = opts.topic || 'T-money transit card';
  const item = topics.find((t) => t.source === topicName);
  if (!item) {
    log.err(`알 수 없는 주제: ${topicName}. 사용 가능한 주제: ${topics.map((t) => t.source).join(', ')}`);
    process.exit(1);
  }

  const seed = Number(opts.seed || 0);
  const rawItem = {
    source: item.source,
    author: item.author,
    url: item.url,
    content: item.content[seed % item.content.length]
  };

  log.section(`큐레이션: ${topicName} (seed=${seed})`);
  const curated = await curateContent(rawItem, ['threads', 'facebook', 'instagram'], seed);

  // 실제 발행 파이프라인(daily-auto-post.js)이 기록한 "최근 사용 이미지" 목록을 그대로
  // 존중해야 진짜로 새 사진이 나옵니다 — 이전엔 빈 배열을 넘겨서 매번 같은 상위 결과가
  // 나왔습니다(2026-08-29 실측 버그). 이번에 고른 사진도 기록해 다음 실행이 또 겹치지
  // 않게 합니다.
  const recentImages = getRecentImageUrls();
  const threadsImages = await fetchTopicImages(item.source, recentImages, seed, 2);
  threadsImages.forEach(recordImageUrl);
  const singleImage = threadsImages[0] || null;

  // 관광공사(TourAPI) 4개 서비스 중 영상 원본을 제공하는 건 없습니다(Odii도 이미지+오디오+
  // 스크립트일 뿐 영상이 아님 — 2026-08-27 확인). 그래서 영상은 Pexels 무료 영상으로 확보합니다
  // (daily-auto-post.js와 동일한 우선순위: Facebook/Instagram = 영상 우선, 없으면 이미지).
  const videoQuery = item.source.replace(/\(.*?\)/g, '').trim();
  let video = await findKoreaVideo(process.env.PEXELS_API_KEY, videoQuery, getRecentVideoUrls());
  if (video) recordVideoUrl(video);

  // 영상에 배경음악을 붙입니다. 실제 차트 인기곡은 저작권 문제로 못 쓰므로(Meta 저작권
  // 매칭에 걸려 음소거/삭제/계정 정지 위험), 합법 CC 카탈로그(Jamendo) 안에서 실제
  // 인기 랭킹(popularity_total) 순으로 고릅니다 — 2026-08-29 사용자에게 설명 후 합의.
  if (video) {
    const music = await findPopularMusic(process.env.JAMENDO_CLIENT_ID, 'upbeat travel', getRecentMusicUrls());
    if (music) {
      log.section('배경음악 합성');
      const mergedPath = await attachMusicToVideo(video, music.url);
      if (mergedPath) {
        try {
          const assetName = `${item.source.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${seed}.mp4`;
          video = await uploadMergedVideoAsset('solusupport-bot/desktop-tutorial', process.env.GITHUB_TOKEN, mergedPath, assetName);
          recordMusicUrl(music.url);
        } finally {
          cleanupMergedVideo(mergedPath);
        }
      }
    }
  }

  const results = {};
  const blogUrl = withUtm(getBlogLinkForTopic(item.source), 'facebook');

  for (const platform of ['threads', 'facebook', 'instagram']) {
    const handler = PLATFORMS[platform];
    const text = platform === 'facebook' ? `${curated[platform]}\n\n📖 Full breakdown: ${blogUrl}` : curated[platform];
    log.section(`${platform} 발행`);
    log.ok(text);
    let payload;
    if (platform === 'threads') {
      payload = { text, imageUrls: threadsImages };
    } else if (video) {
      payload = { text, videoUrl: video };
    } else {
      payload = { text, imageUrl: singleImage };
    }
    const res = await handler.publish(payload);
    results[platform] = res || { error: 'publish failed' };
    if (!res) {
      process.exitCode = 1;
      continue;
    }

    // Graph API가 permalink를 바로 내려주지 않는 경우가 있어 잠깐 대기 후 조회.
    try {
      await wait(3000);
      // Facebook 사진 게시글은 res.id가 사진 ID이고, 실제 페이지 게시글 permalink는
      // res.post_id(페이지ID_게시글ID)로 조회해야 한다 — res.id로는 field가 없다고 나온다.
      const lookupId = (platform === 'facebook' && res.post_id) ? res.post_id : res.id;
      const permalinkData = await getPermalink(platform, lookupId);
      results[platform].permalink = permalinkData.permalink || permalinkData.permalink_url || null;
      log.ok(`${platform} 실제 URL: ${results[platform].permalink}`);
    } catch (err) {
      log.warn(`${platform} permalink 조회 실패: ${err.response?.data?.error?.message || err.message}`);
    }
  }

  console.log('RESULTS_JSON=' + JSON.stringify(results));
};

main();
