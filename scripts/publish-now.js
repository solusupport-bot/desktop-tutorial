#!/usr/bin/env node
// GitHub Actions에서 워크플로우 입력값을 받아 즉시 발행하는 스크립트.
// Facebook, Threads, Instagram에 즉시 발행할 수 있습니다.
require('dotenv').config();
const log = require('../lib/logger');
const { PLATFORMS } = require('../lib/publishing');

const parseArgs = () => {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i += 2) {
    opts[args[i].replace(/^--/, '')] = args[i + 1];
  }
  return opts;
};

const main = async () => {
  const opts = parseArgs();
  if (!opts.text) {
    log.err('사용법: node scripts/publish-now.js --text "게시글 내용" --platforms facebook,threads,instagram [--image https://...]');
    process.exit(1);
  }

  const platforms = (opts.platforms || 'facebook,threads,instagram').split(',');

  for (const platform of platforms) {
    const entry = PLATFORMS[platform];
    if (!entry) {
      log.err(`알 수 없는 플랫폼: ${platform}`);
      continue;
    }
    const result = await entry.publish({ text: opts.text, imageUrl: opts.image });
    if (!result) {
      log.err(`[${platform}] 발행 실패`);
      process.exitCode = 1;
    }
  }
};

main();
