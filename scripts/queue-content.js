#!/usr/bin/env node
// preview-upcoming-topics.js로 확인한 seed에 대해, 미리 써둔 플랫폼별 캡션을
// data/sns_content_queue.json에 저장한다. daily-auto-post.js가 그 seed를 뽑으면
// API 호출 없이 이 내용을 그대로 쓴다.
const log = require('../lib/logger');
const { snsContentQueue } = require('../lib/scheduler/prewritten_content');

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
  if (opts.seed === undefined || !opts.threads || !opts.facebook || !opts.instagram) {
    log.err('사용법: node scripts/queue-content.js --seed <n> --source "<주제명>" --threads "<글>" --facebook "<글>" --instagram "<글>"');
    process.exit(1);
  }

  snsContentQueue.set(opts.seed, {
    source: opts.source || null,
    threads: opts.threads,
    facebook: opts.facebook,
    instagram: opts.instagram
  });
  log.ok(`seed=${opts.seed} 콘텐츠를 큐에 저장했습니다 (${snsContentQueue.QUEUE_PATH}).`);
};

main();
