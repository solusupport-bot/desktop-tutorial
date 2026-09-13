#!/usr/bin/env node
// 영상 게시글 발행 파이프라인 실제 테스트.
// 규칙: 한국관광공사 공공데이터 영상/사진을 우선 사용하기로 했지만, 그 4개 API가
// 아직 키 인증 문제로 막혀 있어 지금은 확인된 대체 규칙대로 Pexels 영상을 쓴다.
// TourAPI가 뚫리면 이 스크립트의 영상 소스만 교체하면 된다.
require('dotenv').config();
const log = require('../lib/logger');
const { fetchKoreaTravelTopics } = require('../lib/ingestion/korea_travel');
const { findKoreaVideo } = require('../lib/ingestion/pexels_video');
const { curateContent } = require('../lib/curation/curate');
const { PLATFORMS } = require('../lib/publishing');
const { getPermalink } = require('../lib/publishing/permalink');
const { attachTopicMusic } = require('../lib/media/attach_topic_music');
const { getRecentVideoUrls, recordVideoUrl } = require('../lib/scheduler/topic_rotation');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const main = async () => {
  const topicName = process.argv[2] || 'Airport transfer options';
  const seed = Number(process.argv[3] || 0);

  const topics = await fetchKoreaTravelTopics();
  const item = topics.find((t) => t.source === topicName);
  if (!item) {
    log.err(`알 수 없는 주제: ${topicName}`);
    process.exit(1);
  }

  const content = Array.isArray(item.content) ? item.content[seed % item.content.length] : item.content;
  const rawItem = { source: item.source, author: item.author, url: item.url, content };

  log.section(`영상 소스 확보 (Pexels 폴백 — TourAPI 영상 연결 전)`);
  // 2026-09-13 실측 사고: 이 스크립트가 getRecentVideoUrls/recordVideoUrl 없이
  // findKoreaVideo만 호출해서 dedup 이력을 완전히 무시했다 — 그 결과 이 테스트 스크립트로
  // 검증 발행한 영상들이 daily-auto-post.js가 예전에 이미 쓴 것과 똑같아, 실제 계정에
  // "같은 영상이 3번 이상 반복"되는 진짜 중복 게시물이 나갔다(사용자 신고로 확인).
  // 프로덕션과 동일한 dedup 이력을 공유해야 이 테스트 스크립트가 실제 계정에 중복
  // 영상을 다시 올리는 사고를 막을 수 있다.
  const videoUrl = await findKoreaVideo(
    process.env.PEXELS_API_KEY, item.source.split('&')[0].split('(')[0].trim(), getRecentVideoUrls()
  );
  if (!videoUrl) {
    log.err('영상을 찾지 못해 테스트를 중단합니다.');
    process.exit(1);
  }
  recordVideoUrl(videoUrl);

  const curated = await curateContent(rawItem, ['threads', 'facebook', 'instagram'], seed);

  const results = {};
  for (const platform of ['threads', 'facebook', 'instagram']) {
    const handler = PLATFORMS[platform];
    let text = curated[platform];
    let publishVideoUrl = videoUrl;
    log.section(`${platform} 영상 발행`);

    // Instagram만 주제 무드에 맞는 배경음악을 합성한다(2026-09-13 음악 수정 검증용) —
    // daily-auto-post.js와 동일한 attachTopicMusic을 그대로 재사용해 실제 운영 로직과
    // 다른 코드 경로로 테스트하는 실수를 막는다.
    if (platform === 'instagram') {
      const captionText = (text || '').split('\n\n')[0] || null;
      const musicResult = await attachTopicMusic(videoUrl, item, process.env.GITHUB_TOKEN, captionText, []);
      if (musicResult) {
        publishVideoUrl = musicResult.videoUrl;
        if (musicResult.attribution) text = `${text}\n\n${musicResult.attribution}`;
        log.ok(`배경음악 합성 완료: ${musicResult.musicUrl}`);
      } else {
        log.warn('배경음악 합성 실패 또는 GITHUB_TOKEN 없음 — 무음 영상 그대로 발행합니다.');
      }
    }

    log.ok(text);
    const res = await handler.publish({ text, videoUrl: publishVideoUrl });
    results[platform] = res || { error: 'publish failed' };
    if (!res) { process.exitCode = 1; continue; }

    try {
      await wait(3000);
      const permalinkData = await getPermalink(platform, res.id);
      results[platform].permalink = permalinkData.permalink || permalinkData.permalink_url || null;
      log.ok(`${platform} 실제 URL: ${results[platform].permalink}`);
    } catch (err) {
      log.warn(`${platform} permalink 조회 실패: ${err.response?.data?.error?.message || err.message}`);
    }
  }

  console.log('VIDEO_RESULTS_JSON=' + JSON.stringify({ videoUrl, results }));
};

main();
