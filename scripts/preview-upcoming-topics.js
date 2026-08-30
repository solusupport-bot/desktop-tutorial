#!/usr/bin/env node
// 자동화가 앞으로 며칠 안에 실제로 뽑게 될 주제/seed를 상태를 건드리지 않고 미리 보여준다.
// Claude Code 세션(대화형, API 과금 없는 경로)에서 이 목록을 보고 캡션을 써서
// scripts/queue-content.js로 큐에 채워두면, 자동 실행 때는 API를 호출하지 않고 이걸 그대로 쓴다.
require('dotenv').config();
const log = require('../lib/logger');
const { fetchKoreaTravelTopics } = require('../lib/ingestion/korea_travel');
const { peekUpcomingTopics } = require('../lib/scheduler/topic_rotation');
const { snsContentQueue } = require('../lib/scheduler/prewritten_content');

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
  const count = Number(opts.count || 9); // 기본 3일치(POSTS_PER_DAY=3 기준)
  const topics = await fetchKoreaTravelTopics();
  const upcoming = peekUpcomingTopics(topics, count);

  log.section(`앞으로 ${count}개 주제 미리보기`);
  upcoming.forEach((item) => {
    const already = snsContentQueue.get(item.seed);
    log.ok(`seed=${item.seed} :: ${item.source}${already ? ' [이미 큐에 있음]' : ''}`);
    log.ok(`  원본: ${item.content}`);
    log.ok(`  출처: ${item.url}`);
  });
};

main().catch((err) => {
  log.err(`미리보기 실패: ${err.message}`);
  process.exit(1);
});
