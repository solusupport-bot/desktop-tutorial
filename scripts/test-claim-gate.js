#!/usr/bin/env node
// 회귀 확인: claimDuePosts의 게이트 — approved:false 차단, verifyStatus는 차단 안 함(2026-09-18),
// 토큰 없는 플랫폼은 대기, 한 실행당 플랫폼별 1건, 같은 플랫폼에 이미 발행된 글과 같은 본문은
// rejected(2026-09-25). data/queue.json을 백업했다가 합성 큐로만 테스트한 뒤 원본으로 복원한다.
//
// 실행: node scripts/test-claim-gate.js
const fs = require('fs');
const log = require('../lib/logger');
const { saveQueue, loadQueue, QUEUE_PATH } = require('../lib/scheduler/queue');
const { claimDuePosts } = require('../lib/scheduler/run');

for (const [k, v] of Object.entries({ THREADS_ACCESS_TOKEN: 't', THREADS_USER_ID: 't', FB_PAGE_ACCESS_TOKEN: 't', FB_PAGE_ID: 't', IG_ACCESS_TOKEN: 't', IG_USER_ID: 't' })) {
  process.env[k] = process.env[k] || v;
}
delete process.env.REDDIT_CLIENT_ID;

const main = () => {
  const backup = fs.existsSync(QUEUE_PATH) ? fs.readFileSync(QUEUE_PATH, 'utf8') : null;
  const t = (min) => new Date(Date.now() - min * 60_000).toISOString();
  const item = (id, platform, scheduledAt, extra = {}) => ({ id, status: 'pending', scheduledAt, approved: true, platforms: [platform], text: id, results: {}, ...extra });

  try {
    saveQueue([
      item('old_threads', 'threads', t(30)),
      item('new_threads', 'threads', t(10)),
      item('unapproved', 'facebook', t(20), { approved: false }),
      item('failed_verify', 'facebook', t(10), { verifyStatus: 'failed' }),
      item('no_creds', 'reddit', t(10)),
      { ...item('published_ig', 'instagram', t(999)), status: 'published', text: 'same' },
      item('dup_ig', 'instagram', t(10), { text: 'same' })
    ]);

    claimDuePosts();

    const after = loadQueue();
    const status = (id) => after.find((i) => i.id === id).status;
    const checks = [
      [status('old_threads') === 'claimed', '가장 오래된 due 항목은 claimed'],
      [status('new_threads') === 'pending', '같은 플랫폼 두 번째 항목은 다음 실행으로 (플랫폼별 1건)'],
      [status('unapproved') === 'pending', 'approved:false 항목은 pending (검수 게이트)'],
      [status('failed_verify') === 'claimed', "verifyStatus:'failed'여도 claimed (검증 게이트 제거됨)"],
      [status('no_creds') === 'pending', '토큰 없는 플랫폼 항목은 pending (모의 발행 방지)'],
      [status('dup_ig') === 'rejected', '이미 발행된 본문과 같은 글은 rejected (중복 방지)']
    ];

    const failed = checks.filter(([pass]) => !pass);
    if (failed.length) {
      failed.forEach(([, msg]) => log.err(msg));
      process.exitCode = 1;
      return;
    }
    log.ok('claim 게이트 검증 통과 (검수·토큰·플랫폼별 1건·중복 차단).');
  } finally {
    if (backup !== null) fs.writeFileSync(QUEUE_PATH, backup, 'utf8');
  }
};

main();
