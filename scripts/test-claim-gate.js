#!/usr/bin/env node
// 1회성 회귀 확인: 검수/검증 하드 게이트(run.js의 claimDuePosts)가 실제로 approved:false
// 또는 verifyStatus:'failed' 항목을 클레임하지 않는지 assert한다. data/queue.json을
// 백업했다가 합성 항목 2개로 테스트한 뒤 원본으로 복원한다 — 실제 큐를 절대 건드리지 않는다.
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
      [byId(failedVerifyId).status === 'pending', "verifyStatus:'failed' 항목은 pending에 그대로 남아야 함 (검증 게이트)"]
    ];

    const failed = checks.filter(([pass]) => !pass);
    if (failed.length) {
      failed.forEach(([, msg]) => log.err(msg));
      process.exitCode = 1;
      return;
    }

    log.ok('검수/검증 하드 게이트 검증 통과 (approved / verifyStatus 모두 정상 차단).');
  } finally {
    if (backup !== null) fs.writeFileSync(QUEUE_PATH, backup, 'utf8');
  }
};

main();
