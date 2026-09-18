#!/usr/bin/env node
// 1회성 회귀 확인: 2026-09-18부로 verifyStatus 하드 게이트는 제거됐다(완전 자동 발행
// 결정) — 남은 건 approved 게이트뿐이고, queue.js 기본값이 true라 사실상 항상 통과한다.
// 이 스크립트는 approved:false만 여전히 클레임을 막는지 확인한다. data/queue.json을
// 백업했다가 합성 항목으로 테스트한 뒤 원본으로 복원한다 — 실제 큐를 절대 건드리지 않는다.
//
// 실행: node scripts/test-claim-gate.js
const fs = require('fs');
const log = require('../lib/logger');
const { loadQueue, saveQueue, QUEUE_PATH } = require('../lib/scheduler/queue');
const { claimDuePosts } = require('../lib/scheduler/run');

const main = () => {
  const backup = fs.existsSync(QUEUE_PATH) ? fs.readFileSync(QUEUE_PATH, 'utf8') : null;
  const past = new Date(Date.now() - 60_000).toISOString();

  try {
    const queue = loadQueue();
    const approvedId = '__test_approved__';
    const unapprovedId = '__test_unapproved__';
    const failedVerifyId = '__test_failed_verify__';

    queue.push(
      { id: approvedId, status: 'pending', scheduledAt: past, approved: true, platforms: ['threads'], results: {} },
      { id: unapprovedId, status: 'pending', scheduledAt: past, approved: false, platforms: ['threads'], results: {} },
      { id: failedVerifyId, status: 'pending', scheduledAt: past, approved: true, verifyStatus: 'failed', platforms: ['threads'], results: {} }
    );
    saveQueue(queue);

    claimDuePosts();

    const after = loadQueue();
    const byId = (id) => after.find((i) => i.id === id);

    const checks = [
      [byId(approvedId).status === 'claimed', 'approved:true 항목은 claimed로 바뀌어야 함'],
      [byId(unapprovedId).status === 'pending', 'approved:false 항목은 pending에 그대로 남아야 함 (검수 게이트)'],
      [byId(failedVerifyId).status === 'claimed', "verifyStatus:'failed'여도 claimed로 바뀌어야 함 (검증 게이트 제거됨, 2026-09-18)"]
    ];

    const failed = checks.filter(([pass]) => !pass);
    if (failed.length) {
      failed.forEach(([, msg]) => log.err(msg));
      process.exitCode = 1;
      return;
    }

    log.ok('claim 게이트 검증 통과 (approved만 차단, verifyStatus는 더 이상 차단하지 않음).');
  } finally {
    if (backup !== null) fs.writeFileSync(QUEUE_PATH, backup, 'utf8');
  }
};

main();
