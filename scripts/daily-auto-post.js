#!/usr/bin/env node
// 매일 1회 실행되는 완전 자동 파이프라인.
// 사람의 승인 없이: 오늘의 주제 3개 선택 -> 중복되지 않는 실사 이미지 확보
// -> 플랫폼별 재가공(Facebook엔 같은 주제의 블로그 글 링크 포함 — topic_blog_links.json이
// 주제<->블로그 글 slug를 관리하고, sync-blog-posts.js가 매일 빠진 글을 채웁니다)
// -> 24시간 안에서 플랫폼마다 다른 랜덤 시간으로 발행 큐 등록.
// 실제 발행은 scheduler.yml(15분 간격)이 예약 시각이 된 항목을 이어서 처리합니다.
//
// 2026-09-16: 실제 큐 등록 로직(이미지/영상 수집~8플랫폼 큐레이션)은
// lib/scheduler/queue_topic.js로 옮겼다 — 대시보드에서 사용자가 지정한 주제를
// 즉시 실행하는 scripts/queue-custom-topic.js도 같은 로직을 재사용하기 위함.
// 이 파일은 "오늘의 주제 3개를 로테이션에서 고른다"는 daily 전용 부분만 남는다.
require('dotenv').config();
const log = require('../lib/logger');
const { fetchKoreaTravelTopics } = require('../lib/ingestion/korea_travel');
const { pickNextTopic, loadState } = require('../lib/scheduler/topic_rotation');
const { queueOneTopic, PLATFORMS } = require('../lib/scheduler/queue_topic');

const POSTS_PER_DAY = 3;

// 콘텐츠가 영어라 미국과 아시아 두 독자층을 다 노리도록 시간대를 섞습니다:
// - 아시아 낮 시간(한국/싱가포르/필리핀 등 UTC+8~+9 오전~정오): UTC 01:00-05:00
// - 미국 동부 업무 시간(여행 리서치 타이밍): UTC 13:00-17:00
// - 미국 동부 저녁(여행 드리밍 타임) + 아시아 심야: UTC 23:00-03:00(자정을 넘어감, 27=다음날 03시)
const DAY_WINDOWS_HOURS = [
  [1, 5],
  [13, 17],
  [23, 27]
];

// 2026-09-03 사용자 요청: scheduler.yml처럼 daily-topic.yml도 실패 시 백업으로 재시도할
// 필요가 생겼는데(GitHub Actions 자체의 00:07 UTC cron이 그날 조용히 스킵된 사례 확인됨),
// scheduler.yml과 달리 이 스크립트는 claim-then-publish 락이 없어 하루에 두 번 실행되면
// 주제가 그대로 2배로 큐잉된다. 오늘 UTC 날짜로 이미 큐잉한 기록이 history에 있으면
// 조용히 건너뛰어, 몇 번을 재시도로 트리거해도 하루 최대 1회만 실제로 큐잉되게 한다.
const alreadyQueuedToday = () => {
  const { history } = loadState();
  const today = new Date().toISOString().slice(0, 10);
  return history.some((h) => h.at && h.at.slice(0, 10) === today);
};

const main = async () => {
  log.section(`Land in Korea 일일 자동 발행 (하루 ${POSTS_PER_DAY}건, 24시간 랜덤 분산)`);

  if (alreadyQueuedToday()) {
    log.ok('오늘(UTC) 이미 주제를 큐잉했습니다 — 백업 재실행 안전을 위해 건너뜁니다.');
    return;
  }

  const topics = await fetchKoreaTravelTopics();
  for (let i = 0; i < POSTS_PER_DAY; i += 1) {
    const topicAndSeed = pickNextTopic(topics);
    await queueOneTopic(topicAndSeed, DAY_WINDOWS_HOURS[i % DAY_WINDOWS_HOURS.length]);
  }

  log.ok(`오늘 ${POSTS_PER_DAY}개 주제를 ${PLATFORMS.join(', ')} 채널에 하루 안에서 랜덤 시각으로 예약했습니다.`);
};

main().catch((err) => {
  log.err(`일일 자동 발행 실패: ${err.message}`);
  process.exit(1);
});
