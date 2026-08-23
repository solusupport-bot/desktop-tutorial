#!/usr/bin/env node
// 이미 큐에 등록된 특정 항목(들)의 이미지를 다른 검색어로 다시 찾아 교체합니다.
// 본문-이미지가 맞지 않는 게 발견됐을 때 수동으로 한 번 바로잡기 위한 유틸리티입니다.
// 사용법(GitHub Actions "Manual Fix Queue Image" workflow_dispatch):
//   QUEUE_IDS=id1,id2  PEXELS_QUERY="새 검색어"  node scripts/patch-queue-image.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const log = require('../lib/logger');
const { getRecentImageUrls, recordImageUrl } = require('../lib/scheduler/topic_rotation');
const { findKoreaPhoto } = require('../lib/ingestion/pexels_image');

const QUEUE_PATH = path.join(__dirname, '..', 'data', 'queue.json');

const main = async () => {
  const ids = (process.env.QUEUE_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const query = process.env.PEXELS_QUERY;
  const apiKey = process.env.PEXELS_API_KEY;

  if (!ids.length || !query) {
    log.err('QUEUE_IDS와 PEXELS_QUERY 환경변수가 모두 필요합니다.');
    process.exit(1);
  }
  if (!apiKey) {
    log.err('PEXELS_API_KEY가 없습니다.');
    process.exit(1);
  }

  const recent = getRecentImageUrls();
  const picked = await findKoreaPhoto(apiKey, query, recent);

  if (!picked) {
    log.err(`"${query}"로 적합한 고화질 이미지를 찾지 못했습니다.`);
    process.exit(1);
  }

  const queue = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8'));
  let patched = 0;
  queue.forEach((item) => {
    if (ids.includes(item.id)) {
      item.imageUrl = picked;
      patched += 1;
    }
  });

  if (!patched) {
    log.err('일치하는 큐 항목을 찾지 못했습니다. QUEUE_IDS를 확인하세요.');
    process.exit(1);
  }

  fs.writeFileSync(QUEUE_PATH, `${JSON.stringify(queue, null, 2)}\n`, 'utf8');
  recordImageUrl(picked);
  log.ok(`큐 항목 ${patched}건의 이미지를 교체했습니다.`);
};

main().catch((err) => {
  log.err(`이미지 교체 실패: ${err.message}`);
  process.exit(1);
});
