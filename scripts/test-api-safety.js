const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'landinkorea-api-safety-'));
process.env.API_SAFETY_STATE_PATH = path.join(tempDir, 'state.json');
delete process.env.API_SAFETY_DISABLED;

const { canPublishNow, recordPublishResult, POLICY } = require('../lib/scheduler/api_safety');
const start = new Date('2026-09-28T00:00:00.000Z');

assert(canPublishNow('threads', start).allowed);
recordPublishResult('threads', true, start);
assert(!canPublishNow('threads', new Date(start.getTime() + 60 * 60 * 1000)).allowed);
assert(!canPublishNow('facebook', new Date(start.getTime() + 10 * 60 * 1000)).allowed);
assert(canPublishNow('facebook', new Date(start.getTime() + 60 * 60 * 1000)).allowed);

// dailyMax가 바뀌어도 깨지지 않도록 POLICY에서 직접 읽는다 — minIntervalMs 간격으로
// dailyMax번 채우면 정확히 24시간을 다 쓰므로, 그 직후 시점은 간격 조건은 통과하지만
// 일일 한도에는 걸려야 한다.
const { minIntervalMs: blueskyInterval, dailyMax: blueskyMax } = POLICY.bluesky;
let t = start.getTime();
for (let index = 0; index < blueskyMax; index += 1) {
  recordPublishResult('bluesky', true, new Date(t));
  t += blueskyInterval;
}
assert(!canPublishNow('bluesky', new Date(t)).allowed);

const later = new Date(start.getTime() + 7 * 60 * 60 * 1000);
recordPublishResult('pinterest', false, later);
recordPublishResult('pinterest', false, new Date(later.getTime() + 4 * 60 * 60 * 1000));
assert(!canPublishNow('pinterest', new Date(later.getTime() + 5 * 60 * 60 * 1000)).allowed);

console.log('\x1b[32m  ✓\x1b[0m API 호출 휴식·일일 한도·연속 오류 차단 검증 통과.');
