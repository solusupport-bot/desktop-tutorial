#!/usr/bin/env node
// 최근 수집된 output/*.md는 사람이 직접 검수하는 것을 권장하므로,
// 이 스크립트는 예시로 raw 트렌드 하나를 받아 큐레이션 후 바로 큐에 등록하는 최소 데모입니다.
require('dotenv').config();
const log = require('../lib/logger');
const { curateContent } = require('../lib/curation/curate');
const { addPost } = require('../lib/scheduler/queue');
const { TOPIC_IMAGES } = require('../lib/ingestion/topic_images');

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
  if (!opts.content || !opts.platforms) {
    log.err('사용법: node scripts/curate-and-schedule.js --content "원문 내용" --source X --author me --url https://... --platforms threads,facebook --image https://... --at 2026-08-21T09:00:00Z');
    process.exit(1);
  }

  const platforms = opts.platforms.split(',');
  const source = opts.source || 'Manual';
  const curated = await curateContent({
    source,
    author: opts.author || 'me',
    content: opts.content,
    url: opts.url || ''
  }, platforms);

  // --image가 없으면 주제(source)에 맞는 대표 이미지를 자동으로 붙입니다.
  const imageUrl = opts.image || TOPIC_IMAGES[source];

  for (const platform of platforms) {
    const item = addPost({
      text: curated[platform],
      imageUrl,
      platforms: [platform],
      scheduledAt: opts.at
    });
    log.ok(`[${platform}] 큐 등록 완료: ${item.id}`);
  }
};

main();
