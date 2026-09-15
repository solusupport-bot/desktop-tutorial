#!/usr/bin/env node
// 1회성 회귀 확인: addPost()가 검수/정보확인 기본값(approved/factCheckStatus/
// reviewedBy/reviewedAt)을 실제로 채우는지 assert한다. data/queue.json을 백업했다가
// 테스트 항목을 넣고 검증 후 원본으로 복원한다 — 실제 큐를 절대 건드리지 않는다.
//
// 실행: node scripts/test-queue-defaults.js
const fs = require('fs');
const log = require('../lib/logger');
const { addPost, QUEUE_PATH } = require('../lib/scheduler/queue');

const main = () => {
  const backup = fs.existsSync(QUEUE_PATH) ? fs.readFileSync(QUEUE_PATH, 'utf8') : null;

  try {
    const item = addPost({
      text: '__test_queue_defaults__',
      platforms: ['threads']
    });

    const checks = [
      [item.approved === false, `approved 기본값은 false여야 함 (실제: ${item.approved})`],
      [item.factCheckStatus === 'pending', `factCheckStatus 기본값은 'pending'이어야 함 (실제: ${item.factCheckStatus})`],
      [item.reviewedBy === null, `reviewedBy 기본값은 null이어야 함 (실제: ${item.reviewedBy})`],
      [item.reviewedAt === null, `reviewedAt 기본값은 null이어야 함 (실제: ${item.reviewedAt})`]
    ];

    const failed = checks.filter(([pass]) => !pass);
    if (failed.length) {
      failed.forEach(([, msg]) => log.err(msg));
      process.exitCode = 1;
      return;
    }

    log.ok('addPost() 기본값 검증 통과 (approved/factCheckStatus/reviewedBy/reviewedAt).');
  } finally {
    if (backup !== null) fs.writeFileSync(QUEUE_PATH, backup, 'utf8');
  }
};

main();
