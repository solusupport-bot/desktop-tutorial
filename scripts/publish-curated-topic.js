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
const { PLATFORMS } = require('../lib/publishing');
const { getPermalink } = require('../lib/publishing/permalink');
const { getBlogLinkForTopic, withUtm } = require('../lib/ingestion/topic_blog_links');

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

  const threadsImages = await fetchTopicImages(item.source, [], seed, 2);
  const singleImage = threadsImages[0] || null;

  const results = {};
  const blogUrl = withUtm(getBlogLinkForTopic(item.source), 'facebook');

  for (const platform of ['threads', 'facebook', 'instagram']) {
    const handler = PLATFORMS[platform];
    const text = platform === 'facebook' ? `${curated[platform]}\n\n📖 Full breakdown: ${blogUrl}` : curated[platform];
    log.section(`${platform} 발행`);
    log.ok(text);
    const payload = platform === 'threads'
      ? { text, imageUrls: threadsImages }
      : { text, imageUrl: singleImage };
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
