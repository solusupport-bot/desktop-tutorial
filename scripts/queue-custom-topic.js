#!/usr/bin/env node
// 대시보드(dashboard/)의 기획 화면에서 사용자가 지정한 주제를 daily-auto-post.js와
// 완전히 동일한 실제 파이프라인(이미지/영상 수집~8플랫폼 큐레이션~큐 등록)에 태운다.
// "로테이션에서 자동으로 고른 주제"가 아니라 "사람이 지금 지정한 그 주제"라는 점만
// 다르고, 나머지 로직(lib/scheduler/queue_topic.js의 queueOneTopic)은 100% 재사용.
//
// 실행: node scripts/queue-custom-topic.js --topic "주제명"
// (주제명은 data/topic_bank.json에 이미 있어야 한다 — 대시보드가 "새 주제 추가" 폼
// 제출 시 먼저 topic_bank.json에 커밋해두고, 그 직후 이 스크립트를 실행한다.)
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const log = require('../lib/logger');
const { loadState } = require('../lib/scheduler/topic_rotation');
const { queueOneTopic } = require('../lib/scheduler/queue_topic');

const TOPIC_BANK_PATH = path.join(__dirname, '..', 'data', 'topic_bank.json');

const parseArgs = () => {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i += 2) {
    opts[args[i].replace(/^--/, '')] = args[i + 1];
  }
  return opts;
};

// 지금부터 5~30분 뒤 — 로테이션 큐잉(하루 단위 큰 윈도우)과 달리, 사용자가 방금
// 지정한 주제는 "바로 처리되는 걸 보고 싶다"는 목적이라 즉시성 있는 좁은 창을 쓴다.
const IMMEDIATE_WINDOW_HOURS = (() => {
  const now = new Date();
  const startH = now.getUTCHours() + now.getUTCMinutes() / 60 + 5 / 60;
  const endH = startH + 25 / 60;
  return [startH, endH];
})();

const main = async () => {
  const opts = parseArgs();
  if (!opts.topic) {
    log.err('사용법: node scripts/queue-custom-topic.js --topic "주제명"');
    process.exit(1);
  }

  const bank = JSON.parse(fs.readFileSync(TOPIC_BANK_PATH, 'utf8'));
  const source = bank.find((t) => t.topic === opts.topic);
  if (!source) {
    log.err(`data/topic_bank.json에서 주제를 찾지 못했습니다: "${opts.topic}"`);
    process.exit(1);
  }

  const seed = loadState().history.length;
  const item = {
    source: source.topic,
    author: source.author,
    url: source.url,
    category: source.category,
    placeKeyword: source.placeKeyword,
    content: Array.isArray(source.content) ? source.content[seed % source.content.length] : source.content
  };

  log.section(`커스텀 주제 즉시 큐잉: ${item.source}`);
  await queueOneTopic({ topic: item, seed }, IMMEDIATE_WINDOW_HOURS);
  log.ok('큐 등록 완료 — 대시보드 /factcheck, /review에서 확인하세요.');
};

main().catch((err) => {
  log.err(`커스텀 주제 큐잉 실패: ${err.message}`);
  process.exit(1);
});
