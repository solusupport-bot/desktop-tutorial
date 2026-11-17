// 2026-11-17: 페이스북만 한국시간 07~10시/17~20시 두 구간에서 게시되게 바꿨다 —
// UTC 변환(KST = UTC+9)을 손으로 하다 부호를 틀리면 하루 종일 엉뚱한 시간에
// 올라가므로, 생성된 시각이 실제로 그 두 구간 안에 KST로 떨어지는지 확인한다.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { randomFacebookTime } = require('./queue_topic');

test('randomFacebookTime always lands in KST 07-10 or 17-20', () => {
  const now = new Date('2026-11-17T00:00:00.000Z');
  for (let i = 0; i < 200; i += 1) {
    const result = randomFacebookTime(now);
    const kstHour = (result.getUTCHours() + 9) % 24;
    const inMorning = kstHour >= 7 && kstHour < 10;
    const inEvening = kstHour >= 17 && kstHour < 20;
    assert.ok(inMorning || inEvening, `${result.toISOString()} -> KST hour ${kstHour} is outside both windows`);
  }
});
