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
  const videoUrl = await findKoreaVideo(process.env.PEXELS_API_KEY, item.source.split('&')[0].split('(')[0].trim());
  if (!videoUrl) {
    log.err('영상을 찾지 못해 테스트를 중단합니다.');
    process.exit(1);
  }

  const curated = await curateContent(rawItem, ['threads', 'facebook', 'instagram'], seed);

  const results = {};
  for (const platform of ['threads', 'facebook', 'instagram']) {
    const handler = PLATFORMS[platform];
    const text = curated[platform];
    log.section(`${platform} 영상 발행`);
    log.ok(text);
    const res = await handler.publish({ text, videoUrl });
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
