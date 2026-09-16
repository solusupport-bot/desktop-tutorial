#!/usr/bin/env node
// 대시보드 /review 페이지의 "🎵 다른 음악으로" 버튼이 호출하는 스크립트.
// attachTopicMusic은 daily-auto-post.js/queue-custom-topic.js가 쓰는 것과 동일한
// 함수를 그대로 재사용한다 — item.sourceVideoUrl(원본 Pexels/Pixabay URL, 큐에
// 영구 보존됨)을 다시 넘기면 내부에서 알아서 다운로드하므로 재다운로드 코드를
// 새로 짤 필요가 없다. getRecentMusicUrls()를 그대로 넘겨 방금 쓴 곡이 또
// 걸리지 않게 한다(신규 상태 불필요, 기존 반복 방지 메커니즘 재사용).
//
// 실행: node scripts/reroll-music.js --id <queueItemId>
// git commit/push는 이 스크립트가 하지 않는다 — dashboard/routes/review.js가
// syncAndCommit으로 감싸서 처리한다(review.js/factcheck.js와 동일 패턴).
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const log = require('../lib/logger');
const { loadQueue, saveQueue } = require('../lib/scheduler/queue');
const { getRecentMusicUrls, recordMusicUrl } = require('../lib/scheduler/topic_rotation');
const { attachTopicMusic } = require('../lib/media/attach_topic_music');

const TOPIC_BANK_PATH = path.join(__dirname, '..', 'data', 'topic_bank.json');

const parseArgs = () => {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i += 2) {
    opts[args[i].replace(/^--/, '')] = args[i + 1];
  }
  return opts;
};

const replaceMusicLine = (text, newAttributionLine) => {
  const withoutOldLine = text.replace(/\n\n🎵[\s\S]*$/, '');
  return newAttributionLine ? `${withoutOldLine}\n\n${newAttributionLine}` : withoutOldLine;
};

const main = async () => {
  const opts = parseArgs();
  if (!opts.id) {
    log.err('사용법: node scripts/reroll-music.js --id <queueItemId>');
    process.exit(1);
  }

  const queue = loadQueue();
  const item = queue.find((i) => i.id === opts.id);
  if (!item) {
    log.err(`큐에서 항목을 찾지 못했습니다: ${opts.id}`);
    process.exit(1);
  }
  if (!item.platforms.includes('instagram') || !item.sourceVideoUrl) {
    log.err('인스타그램용 원본 영상(sourceVideoUrl)이 있는 항목만 음악을 교체할 수 있습니다.');
    process.exit(1);
  }
  if (!process.env.GITHUB_TOKEN) {
    log.err('GITHUB_TOKEN 환경변수가 없어 합성 영상을 업로드할 수 없습니다 — .env에 추가하세요.');
    process.exit(1);
  }

  const bank = JSON.parse(fs.readFileSync(TOPIC_BANK_PATH, 'utf8'));
  const source = bank.find((t) => t.topic === item.topic) || {};

  log.section(`음악 교체: ${item.topic || item.id}`);
  const result = await attachTopicMusic(
    item.sourceVideoUrl,
    { source: item.topic || '', category: source.category, placeKeyword: source.placeKeyword },
    process.env.GITHUB_TOKEN,
    item.text,
    getRecentMusicUrls()
  );

  if (!result) {
    log.err('새 음악 합성/업로드에 실패했습니다 — 원본 영상은 그대로 유지됩니다.');
    process.exit(1);
  }

  item.videoUrl = result.videoUrl;
  item.text = replaceMusicLine(item.text, result.attribution);
  saveQueue(queue);
  recordMusicUrl(result.musicUrl);

  log.ok(`음악 교체 완료 -> ${result.videoUrl}`);
};

main().catch((err) => {
  log.err(`음악 교체 실패: ${err.message}`);
  process.exit(1);
});
