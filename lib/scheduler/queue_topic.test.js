// 2026-11-17: 페이스북만 한국시간 07~10시/17~20시 두 구간에서 게시되게 바꿨다 —
// UTC 변환(KST = UTC+9)을 손으로 하다 부호를 틀리면 하루 종일 엉뚱한 시간에
// 올라가므로, 생성된 시각이 실제로 그 두 구간 안에 KST로 떨어지는지 확인한다.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { randomFacebookTime } = require('./queue_topic');
const { applyPlatformLinkRule } = require('./content_rules');
const { addMultilingual } = require('../curation/translate');

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

// 2026-11-18 실측 버그: 번역이 applyPlatformLinkRule(링크 규칙 정리 + "link in bio" CTA
// 삽입)보다 먼저 실행돼서, 번역 문단들 뒤에 영어 전용 CTA 줄이 따로 떨어져 있었다.
// queueOneTopic은 이제 applyPlatformLinkRule로 영어를 완성한 뒤에만 addMultilingual을
// 부른다 — 이 순서(링크 규칙 -> 번역)를 그대로 재현해, CTA 줄도 같이 번역 대상에
// 들어가는지(번역 뒤에 영어 줄이 남지 않는지) 확인한다.
test('applyPlatformLinkRule -> addMultilingual order keeps the profile-link CTA inside translation, not trailing after it', async () => {
  const prevKeys = {
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN,
    CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID
  };
  delete process.env.GROQ_API_KEY;
  delete process.env.CLOUDFLARE_API_TOKEN;
  delete process.env.CLOUDFLARE_ACCOUNT_ID;
  try {
    const raw = 'Most Korean eSIM plans for tourists can be purchased online before arrival.';
    const withCta = applyPlatformLinkRule('threads', raw, 'eSIM & mobile data');
    assert.ok(/link in (?:our )?(?:bio|profile)/i.test(withCta), 'applyPlatformLinkRule must add the bio-link CTA first');
    // 번역 키가 없을 때 addMultilingual은 입력을 그대로 돌려준다 — 여기서 중요한 건
    // "입력에 이미 CTA가 포함돼 있다"는 것 자체다(그래야 실제 번역 호출에서도 같이 번역됨).
    const result = await addMultilingual({ threads: withCta });
    assert.equal(result.threads, withCta);
  } finally {
    Object.entries(prevKeys).forEach(([k, v]) => { if (v !== undefined) process.env[k] = v; });
  }
});
