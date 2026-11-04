#!/usr/bin/env node
// 2026-11-04 사용자 지시: Threads는 하루 8~10건(목표 9), 나머지 플랫폼(공유 daily-auto-post
// 배치)은 하루 4건으로 낮춤. ensure-instagram-daily.js와 같은 패턴 — 공유 배치가 플랫폼별
// 목표에 못 미치면 이 스크립트가 Threads 몫만 로테이션에서 더 뽑아 채운다.
require('dotenv').config();
const log = require('../lib/logger');
const { loadQueue } = require('../lib/scheduler/queue');
const { fetchKoreaTravelTopics } = require('../lib/ingestion/korea_travel');
const { pickNextTopic, loadState, saveState } = require('../lib/scheduler/topic_rotation');
const { queueOneTopic } = require('../lib/scheduler/queue_topic');

const TARGET_PER_DAY = 9;
// daily-auto-post.js와 같은 이유로 실행당 1건만 — 한 번에 여러 건을 만들면 이미지/영상
// 검색과 품질 검사가 길어져 다음 예약 실행이 기존 프로세스를 죽인다.
const MAX_ATTEMPTS = 1;

const todayCount = () => {
  const queue = loadQueue();
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayEnd = todayStart.getTime() + 24 * 3600 * 1000;
  return queue.filter((item) => {
    if (!(item.platforms || []).includes('threads')) return false;
    if (item.status === 'rejected') return false;
    const t = Date.parse(item.scheduledAt);
    return t >= todayStart.getTime() && t < todayEnd;
  }).length;
};

const lastThreadsStatus = () => {
  const queue = loadQueue();
  for (let i = queue.length - 1; i >= 0; i -= 1) {
    if ((queue[i].platforms || []).includes('threads')) return queue[i];
  }
  return null;
};

const main = async () => {
  const have = todayCount();
  log.section(`Threads 하루 목표 확인 (오늘 ${have}/${TARGET_PER_DAY})`);
  if (have >= TARGET_PER_DAY) {
    log.ok('오늘 목표를 이미 채웠습니다 — 건너뜁니다.');
    return;
  }

  const topics = await fetchKoreaTravelTopics();
  let attempts = 0;
  while (todayCount() < TARGET_PER_DAY && attempts < MAX_ATTEMPTS) {
    attempts += 1;
    const historyLengthBefore = loadState().history.length;
    const topicAndSeed = pickNextTopic(topics, 'threads-fill');
    log.ok(`시도 ${attempts}/${MAX_ATTEMPTS}: ${topicAndSeed.topic.source}`);
    try {
      await queueOneTopic(topicAndSeed, [0, 24], ['threads']);
    } catch (err) {
      const state = loadState();
      state.history = state.history.slice(0, historyLengthBefore);
      saveState(state);
      throw err;
    }
    const latest = lastThreadsStatus();
    if (latest && latest.status === 'rejected') {
      log.warn(`반려(${latest.rejectedBy || latest.rejectReason || '사유 미상'}) — 다음 후보로 넘어갑니다.`);
    }
  }

  const finalCount = todayCount();
  if (finalCount >= TARGET_PER_DAY) {
    log.ok(`Threads 오늘 목표 달성 (${finalCount}/${TARGET_PER_DAY}, 시도 ${attempts}회).`);
  } else {
    log.warn(`이번 후보가 품질게이트로 반려됨 — 현재 ${finalCount}/${TARGET_PER_DAY}, 다음 실행에서 다음 후보를 시도합니다.`);
  }
};

main().catch((err) => {
  log.err(`Threads 하루 목표 보충 실패: ${err.message}`);
  process.exit(1);
});
