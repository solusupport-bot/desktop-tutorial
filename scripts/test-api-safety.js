const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'landinkorea-api-safety-'));
process.env.API_SAFETY_STATE_PATH = path.join(tempDir, 'state.json');
delete process.env.API_SAFETY_DISABLED;

const { canPublishNow, recordPublishResult } = require('../lib/scheduler/api_safety');
const start = new Date('2026-09-28T00:00:00.000Z');

assert(canPublishNow('threads', start).allowed);
recordPublishResult('threads', true, start);
assert(!canPublishNow('threads', new Date(start.getTime() + 60 * 60 * 1000)).allowed);
assert(!canPublishNow('facebook', new Date(start.getTime() + 10 * 60 * 1000)).allowed);
assert(canPublishNow('facebook', new Date(start.getTime() + 60 * 60 * 1000)).allowed);

for (let index = 0; index < 8; index += 1) {
  recordPublishResult('bluesky', true, new Date(start.getTime() + index * 2 * 60 * 60 * 1000));
}
assert(!canPublishNow('bluesky', new Date(start.getTime() + 17 * 60 * 60 * 1000)).allowed);

const later = new Date(start.getTime() + 7 * 60 * 60 * 1000);
recordPublishResult('pinterest', false, later);
recordPublishResult('pinterest', false, new Date(later.getTime() + 4 * 60 * 60 * 1000));
assert(!canPublishNow('pinterest', new Date(later.getTime() + 5 * 60 * 60 * 1000)).allowed);

console.log('\x1b[32m  ✓\x1b[0m API 호출 휴식·일일 한도·연속 오류 차단 검증 통과.');
