#!/usr/bin/env node
// 1회성 마이그레이션: 검수/검증 하드 게이트(run.js의 claimDuePosts)를 배포하는
// 그 커밋에서 함께 실행한다. 게이트 배포 시점에 이미 'pending'인 큐 항목은
// approved:false 기본값 때문에 갑자기 클레임되지 않고 멈춰버리므로, 그 항목들만
// approved:true로 일괄 승인해 발행이 조용히 멈추는 일을 막는다.
//
// 이미 status가 pending을 지난 항목(claimed/published/partial)은 게이트를 이미
// 통과했으므로 건드리지 않는다.
//
// 실행: node scripts/migrate-approve-existing-queue.js
const log = require('../lib/logger');
const { loadQueue, saveQueue } = require('../lib/scheduler/queue');

const main = () => {
  const queue = loadQueue();
  let migrated = 0;

  queue.forEach((item) => {
    if (item.status === 'pending' && item.approved !== true) {
      item.approved = true;
      migrated += 1;
    }
  });

  if (migrated === 0) {
    log.ok('마이그레이션 대상 없음 — 이미 승인되지 않은 pending 항목이 없습니다.');
    return;
  }

  saveQueue(queue);
  log.ok(`pending 항목 ${migrated}건을 approved:true로 마이그레이션했습니다.`);
};

main();
