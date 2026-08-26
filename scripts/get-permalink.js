#!/usr/bin/env node
// 발행된 미디어의 실제 공개 URL(permalink)을 Graph API로 조회하는 진단용 스크립트.
require('dotenv').config();
const { getPermalink } = require('../lib/publishing/permalink');
const log = require('../lib/logger');

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
  if (!opts.platform || !opts.id) {
    log.err('사용법: node scripts/get-permalink.js --platform instagram|facebook|threads --id <media_or_post_id>');
    process.exit(1);
  }

  try {
    const data = await getPermalink(opts.platform, opts.id);
    log.ok(`조회 결과: ${JSON.stringify(data)}`);
  } catch (err) {
    log.err(`조회 실패: ${err.response?.data?.error?.message || err.message}`);
    process.exitCode = 1;
  }
};

main();
