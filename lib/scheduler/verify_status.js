// 두 검증 스크립트(verify-no-duplicate-media.js, verify-topic-media-alignment.js)가
// 각자 발견한 문제를 큐 항목의 verifyStatus로 기록하는 공용 헬퍼. 한 스크립트가
// 'failed'로 기록한 항목을 다른 스크립트의 통과 판정이 되돌려 'passed'로 덮어쓰지
// 않도록 병합 규칙을 여기 한 곳에 둔다 — 둘 중 하나라도 실패하면 계속 실패로 남는다.
const { loadQueue, saveQueue } = require('./queue');

/**
 * isFailure(item) => boolean — pending 항목 각각에 대해 이번 검증 기준으로
 * 실패인지 판정한다. 실패면 verifyStatus='failed', 아니면(이미 다른 검증에서
 * 실패로 찍힌 게 아닌 한) 'passed'로 기록한다.
 */
const applyVerifyStatus = (isFailure) => {
  const queue = loadQueue();
  let changed = false;

  queue.forEach((item) => {
    if (item.status !== 'pending') return;
    const failed = isFailure(item);
    const next = failed ? 'failed' : (item.verifyStatus === 'failed' ? 'failed' : 'passed');
    if (item.verifyStatus !== next) {
      item.verifyStatus = next;
      changed = true;
    }
  });

  if (changed) saveQueue(queue);
  return changed;
};

module.exports = { applyVerifyStatus };
