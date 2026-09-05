#!/usr/bin/env node
/**
 * 승인 절차 없는 채널(Bluesky / Mastodon / Tumblr)의 자격증명이 실제로 동작하는지
 * 1회성으로 확인하는 스크립트. test-pinterest-publish.js와 같은 역할이다.
 *
 * 세 채널 모두 플랫폼 심사가 없어서(앱 비밀번호 / 액세스 토큰 발급이 끝) 여기서
 * 실패하면 원인은 사실상 자격증명 오타이거나 권한 범위 부족 둘 중 하나다 —
 * Pinterest처럼 "승인 대기 중이라 안 되는" 경우가 없다.
 *
 * 사용법:
 *   BLUESKY_IDENTIFIER=... BLUESKY_APP_PASSWORD=... node scripts/test-open-channel-publish.js
 *   MASTODON_INSTANCE=https://mastodon.social MASTODON_ACCESS_TOKEN=... node scripts/test-open-channel-publish.js
 *   TUMBLR_CONSUMER_KEY=... TUMBLR_CONSUMER_SECRET=... TUMBLR_TOKEN=... TUMBLR_TOKEN_SECRET=... \
 *     TUMBLR_BLOG_IDENTIFIER=... node scripts/test-open-channel-publish.js
 *   (여러 개를 넣으면 넣은 만큼 실제 발행하고, 넣지 않은 나머지는 모의 발행.)
 */
const { publishToBluesky } = require('../lib/publishing/bluesky');
const { publishToMastodon } = require('../lib/publishing/mastodon');
const { publishToTumblr } = require('../lib/publishing/tumblr');
const log = require('../lib/logger');

// 실제 계정 타임라인에 남는 글이므로, 테스트 티가 나면서도 계정 톤을 해치지 않는
// 실제로 맞는 정보를 쓴다 — 지어낸 사실을 테스트용이라고 올리지 않는다.
const TEST_TEXT = [
  'Quick test post from the Land in Korea publishing pipeline.',
  'Korea has three emergency numbers worth saving before you land: 112 for police, 119 for fire and ambulance, and 1330 for the 24/7 multilingual travel hotline.',
  'Anything you wish you had saved before your first trip?'
].join('\n\n');

const BLOG_URL = 'https://landinkorea.com/posts/korea-emergency-numbers-pharmacy-guide.html';

const run = async () => {
  const targets = [
    { name: 'Bluesky', publish: publishToBluesky, configured: !!(process.env.BLUESKY_IDENTIFIER && process.env.BLUESKY_APP_PASSWORD) },
    { name: 'Mastodon', publish: publishToMastodon, configured: !!(process.env.MASTODON_INSTANCE && process.env.MASTODON_ACCESS_TOKEN) },
    {
      name: 'Tumblr',
      publish: publishToTumblr,
      configured: !!(process.env.TUMBLR_CONSUMER_KEY && process.env.TUMBLR_CONSUMER_SECRET
        && process.env.TUMBLR_TOKEN && process.env.TUMBLR_TOKEN_SECRET && process.env.TUMBLR_BLOG_IDENTIFIER)
    }
  ];

  if (!targets.some((t) => t.configured)) {
    log.warn('Bluesky/Mastodon/Tumblr 자격증명이 하나도 없습니다 — 모의 발행만 수행합니다.');
  }

  let failed = false;
  for (const target of targets) {
    log.info(`[${target.name}] ${target.configured ? '실제 발행 시도' : '자격증명 없음 (모의 발행)'}`);
    const result = await target.publish({
      text: TEST_TEXT,
      blogUrl: BLOG_URL,
      topic: 'Korea emergency numbers'
    });

    if (!result) {
      log.err(`[${target.name}] 발행 실패 — 위 오류 메시지를 확인하세요.`);
      failed = true;
      continue;
    }
    log.ok(`[${target.name}] 성공: ${result.url || result.id}`);
  }

  if (failed) process.exitCode = 1;
};

run().catch((err) => {
  log.err(`테스트 실행 중 오류: ${err.message}`);
  process.exitCode = 1;
});
