#!/usr/bin/env node
// Threads 영상 발행만 단독으로 재시도 — 이미 성공한 Facebook/Instagram은 다시 안 올린다.
require('dotenv').config();
const log = require('../lib/logger');
const { publishToThreads } = require('../lib/publishing/threads');
const { getPermalink } = require('../lib/publishing/permalink');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const main = async () => {
  const videoUrl = process.argv[2];
  const text = process.argv[3];
  if (!videoUrl || !text) {
    log.err('사용법: node scripts/retry-threads-video.js <videoUrl> <text>');
    process.exit(1);
  }

  const res = await publishToThreads({ text, videoUrl });
  if (!res) { process.exitCode = 1; return; }

  try {
    await wait(3000);
    const permalinkData = await getPermalink('threads', res.id);
    log.ok(`threads 실제 URL: ${permalinkData.permalink}`);
  } catch (err) {
    log.warn(`permalink 조회 실패: ${err.response?.data?.error?.message || err.message}`);
  }
};

main();
