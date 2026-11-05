#!/usr/bin/env node
/**
 * scripts/delete-bluesky-post.js --rkey <rkey>
 *
 * 잘못 올라간 우리 계정 Bluesky 글을 지운다. rkey는 게시물 URL의 마지막 조각
 * (https://bsky.app/profile/<handle>/post/<rkey>).
 */
require('dotenv').config();
const log = require('../lib/logger');
const { deleteBlueskyPost } = require('../lib/publishing/bluesky');

const main = async () => {
  const idx = process.argv.indexOf('--rkey');
  const rkey = idx >= 0 ? process.argv[idx + 1] : null;
  if (!rkey) {
    log.err('사용법: node scripts/delete-bluesky-post.js --rkey <rkey>');
    process.exitCode = 1;
    return;
  }
  const ok = await deleteBlueskyPost({ rkey });
  if (!ok) process.exitCode = 1;
};

main();
