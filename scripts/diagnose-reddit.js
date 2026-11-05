#!/usr/bin/env node
/**
 * scripts/diagnose-reddit.js
 *
 * Reddit이 2026-11-03부터 lib/scheduler/paused_platforms.js로 일시 중지된 원인을
 * 찾기 위한 읽기 전용 진단 스크립트 — 아무것도 올리지 않는다. OAuth 토큰 발급과
 * 검색 1건만 시도해서 실제 에러 메시지를 그대로 보여준다.
 */
require('dotenv').config();
const log = require('../lib/logger');
const { getAuthToken, searchReddit } = require('../lib/publishing/reddit');

const main = async () => {
  log.section('Reddit OAuth 토큰 발급 테스트');
  const hasCreds = Boolean(
    process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET
    && process.env.REDDIT_USERNAME && process.env.REDDIT_PASSWORD
  );
  if (!hasCreds) {
    log.err('REDDIT_CLIENT_ID/SECRET/USERNAME/PASSWORD 중 일부가 비어있습니다.');
    process.exitCode = 1;
    return;
  }

  let token;
  try {
    token = await getAuthToken();
  } catch (err) {
    log.err(`토큰 발급 실패: ${err.response?.status} ${JSON.stringify(err.response?.data || {})} / ${err.message}`);
    process.exitCode = 1;
    return;
  }
  if (!token) {
    log.err('토큰이 null로 돌아옴 (자격증명이 getAuthToken 내부에서 비어있다고 판단됨).');
    process.exitCode = 1;
    return;
  }
  log.ok(`토큰 발급 성공 (앞 8자: ${token.slice(0, 8)}...)`);

  log.section('읽기 전용 검색 테스트 (r/korea, 1건만)');
  try {
    const posts = await searchReddit({ subreddits: ['korea'], query: 'travel', limit: 1 });
    log.ok(`검색 성공 — ${posts.length}건 반환됨${posts[0] ? `: "${posts[0].title}"` : ''}`);
  } catch (err) {
    log.err(`검색 실패: ${err.response?.status} ${JSON.stringify(err.response?.data || {})} / ${err.message}`);
    process.exitCode = 1;
  }
};

main();
