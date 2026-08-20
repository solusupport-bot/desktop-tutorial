#!/usr/bin/env node
require('dotenv').config();
const log = require('../lib/logger');
const { addPost } = require('../lib/scheduler/queue');

const parseArgs = () => {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i += 2) {
    opts[args[i].replace(/^--/, '')] = args[i + 1];
  }
  return opts;
};

const main = () => {
  const opts = parseArgs();

  if (!opts.text || !opts.platforms) {
    log.err('사용법: node scripts/schedule-post.js --text "..." --platforms threads,facebook --image https://... --at 2026-08-21T09:00:00Z');
    process.exit(1);
  }

  const item = addPost({
    text: opts.text,
    imageUrl: opts.image,
    platforms: opts.platforms.split(','),
    scheduledAt: opts.at
  });

  log.ok(`큐 등록 완료: ${item.id} (예약 시각: ${item.scheduledAt})`);
};

main();
