#!/usr/bin/env node
// 실제 큐레이션 파이프라인(curateContent + Threads 캐로셀/답글 체인)을 그대로 써서
// 한 주제를 Threads/Facebook/Instagram에 "즉시" 발행하는 테스트 스크립트.
// daily-auto-post.js(실제 매일 자동 발행)와 최대한 같은 미디어 로직을 씁니다:
// Facebook = 이미지 앨범, Threads = 이미지 캐로셀(훅+답글 체인, threads.js가 처리),
// Instagram = 영상(있으면 주제에 맞는 배경음악 합성) 우선, 없으면 이미지 캐로셀.
//
// 표준 규칙(앞으로도 적용):
// - 각 플랫폼은 curate.js의 PLATFORM_GUIDE에 따라 서로 다른 글로 재가공된다
//   (동일 문구를 3개 채널에 복붙하지 않는다).
// - Threads는 벤치마킹한 고성과 게시물 구조를 따른다: 구체적 숫자/지명이 훅으로
//   오고(pickHookSentence), 빈 줄로 나뉜 나머지 문단은 답글 체인(최대 4개)으로 이어진다.
require('dotenv').config();
const fs = require('fs');
const log = require('../lib/logger');
const { fetchKoreaTravelTopics } = require('../lib/ingestion/korea_travel');
const { curateContent } = require('../lib/curation/curate');
const { fetchTopicImages } = require('../lib/ingestion/pexels_image');
const { findKoreaVideo } = require('../lib/ingestion/pexels_video');
const { findKoreaAttractionPhoto } = require('../lib/ingestion/tour_odii_image');
const { watermarkAndHostImages } = require('../lib/media/watermark_images');
const { findMusic } = require('../lib/ingestion/openverse_music');
const { attachMusicToVideo, cleanupMergedVideo } = require('../lib/media/mix_audio');
const { moodForTopic } = require('../lib/media/topic_music');
const { uploadMediaFile } = require('../lib/publishing/github_raw_host');
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
  // 존중해야 진짜로 새 사진이 나옵니다. 관광지 스포트라이트 주제는 한국관광공사(Odii)
  // 실사진이 있으면 우선한다(daily-auto-post.js와 동일한 우선순위).
  const recentImages = getRecentImageUrls();
  const images = [];
  if (item.placeKeyword) {
    const tourPhoto = await findKoreaAttractionPhoto(item.placeKeyword, recentImages);
    if (tourPhoto) images.push(tourPhoto);
  }
  images.push(...(await fetchTopicImages(item.source, [...recentImages, ...images], seed, 4 - images.length)));
  images.forEach(recordImageUrl);
  const watermarkedImages = await watermarkAndHostImages(images, 'solusupport-bot/desktop-tutorial', process.env.GITHUB_TOKEN);

  // 관광공사(TourAPI) 4개 서비스 중 영상 원본을 제공하는 건 없습니다(Odii도 이미지+오디오+
  // 스크립트일 뿐 영상이 아님 — 2026-08-27 확인). 그래서 영상은 Pexels 무료 영상으로 확보합니다.
  // Instagram만 영상(Reels) 우선 — Facebook은 실측 반응이 더 좋은 이미지로 고정(2026-08-31).
  const videoQuery = item.source.replace(/\(.*?\)/g, '').trim();
  const video = await findKoreaVideo(process.env.PEXELS_API_KEY, videoQuery, getRecentVideoUrls());
  if (video) recordVideoUrl(video);

  let instagramVideo = video;
  let instagramMusicAttribution = null;
  if (video && process.env.GITHUB_TOKEN) {
    const music = await findMusic(moodForTopic(item), getRecentMusicUrls());
    if (music) {
      const mergedPath = await attachMusicToVideo(video, music.url);
      if (mergedPath) {
        try {
          const buffer = fs.readFileSync(mergedPath);
          instagramVideo = await uploadMediaFile(
            'solusupport-bot/desktop-tutorial', process.env.GITHUB_TOKEN, buffer, `videos/${Date.now()}-instagram-test.mp4`
          );
          recordMusicUrl(music.url);
          instagramMusicAttribution = `🎵 ${music.attribution}`;
        } catch (err) {
          log.err(`합성 영상 호스팅 실패, 음악 없이 발행: ${err.response?.data?.message || err.message}`);
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
    let text = curated[platform];
    if (platform === 'facebook') {
      text = `${text}\n\n📖 Full breakdown: ${blogUrl}`;
    } else if (platform === 'instagram' && instagramVideo && instagramMusicAttribution) {
      text = `${text}\n\n${instagramMusicAttribution}`;
    }
    log.section(`${platform} 발행`);
    log.ok(text);

    let payload;
    if (platform === 'threads') {
      payload = { text, imageUrls: watermarkedImages };
    } else if (platform === 'facebook') {
      payload = { text, imageUrls: watermarkedImages };
    } else if (instagramVideo) {
      payload = { text, videoUrl: instagramVideo };
    } else {
      payload = { text, imageUrls: watermarkedImages };
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
