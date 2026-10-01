#!/usr/bin/env node
// 이미 렌더링된 카드뉴스 9장을 큐에 등록합니다.
// 사용법:
//   node scripts/queue-existing-card-news.js --topic "Myeongdong shopping district" --dir output/card-news/myeongdong-shopping-district-real-20260926

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const log = require('../lib/logger');
const { uploadMediaFiles } = require('../lib/publishing/media_host');
const { curateContent } = require('../lib/curation/curate');
const { addPost } = require('../lib/scheduler/queue');
const { pickAngle } = require('../lib/scheduler/topic_rotation');
const { fetchKoreaTravelTopics } = require('../lib/ingestion/korea_travel');

const parseArgs = () => {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : null;
  };
  return {
    topic: get('--topic'),
    dir: get('--dir'),
    seed: Number(get('--seed') || 0),
    dryRun: args.includes('--dry-run')
  };
};

const main = async () => {
  const { topic: topicName, dir, seed, dryRun } = parseArgs();

  if (!topicName || !dir) {
    log.err('사용법: node scripts/queue-existing-card-news.js --topic "<주제명>" --dir <렌더링된파일디렉토리> [--seed N] [--dry-run]');
    process.exit(1);
  }

  if (!fs.existsSync(dir)) {
    throw new Error(`디렉토리를 찾을 수 없습니다: ${dir}`);
  }

  log.section(`"${topicName}" 주제 로드`);
  const topics = await fetchKoreaTravelTopics();
  const topicItem = topics.find((t) => t.source === topicName);
  if (!topicItem) {
    throw new Error(`"${topicName}" 주제를 찾을 수 없습니다.`);
  }

  log.section(`${dir}에서 파일 목록 가져오기`);
  const files = fs.readdirSync(dir)
    .filter((f) => f.endsWith('.png'))
    .sort()
    .map((f) => path.join(dir, f));

  if (files.length === 0) {
    throw new Error(`렌더링된 PNG 파일을 찾을 수 없습니다: ${dir}`);
  }
  log.ok(`${files.length}장 발견`);

  if (dryRun) {
    log.section('--dry-run: 업로드/큐 등록 생략');
    log.ok(`다음 단계: node scripts/queue-existing-card-news.js --topic "${topicName}" --dir "${dir}" (--dry-run 제거)`);
    return;
  }

  log.section('landinkorea.com에 업로드');
  const setName = path.basename(dir);
  const uploadFiles = files.map((filePath) => ({
    buffer: fs.readFileSync(filePath),
    relativePath: `card-news/${setName}/${path.basename(filePath)}`
  }));
  const imageUrls = await uploadMediaFiles(uploadFiles);
  log.ok(`${imageUrls.length}장 업로드 완료`);

  log.section('Instagram 캡션 생성');
  const captionSourceItem = { ...topicItem, content: pickAngle(topicItem.content, seed) };
  const curated = await curateContent(captionSourceItem, ['instagram'], seed);

  const queued = addPost({
    text: curated.instagram,
    imageUrls,
    platforms: ['instagram'],
    topic: topicItem.source,
    cardNewsSet: setName
  });

  log.section('완료');
  log.ok(`큐 등록: ${queued.id} (캐로셀 ${imageUrls.length}장, 예약 ${queued.scheduledAt})`);
};

main().catch((err) => {
  log.err(`카드뉴스 큐 등록 실패: ${err.message}`);
  process.exit(1);
});
