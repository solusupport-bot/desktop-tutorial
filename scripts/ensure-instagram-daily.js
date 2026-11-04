#!/usr/bin/env node
// 2026-10-17/18 사용자 지시: "하루에 3개씩 꾸준하게 랜덤으로 올려라" + "인스타는 안 올라갔네".
// daily-auto-post.js는 이미 하루 3개 주제를 전체 7개 플랫폼에 동시 큐잉하지만, Instagram만
// "영상 없으면 반려"라는 하드룰 때문에 같은 날 다른 플랫폼은 성공해도 Instagram만 실패하는
// 일이 실측으로 반복됐다(2026-10-17: 3번 시도 중 1번만 성공). 이 스크립트는 오늘(UTC) Instagram
// 몫이 목표(3개)에 못 미치면, 공유 로테이션(pickNextTopic — 중복 방지)에서 다음 주제를 하나씩
// 더 뽑아 Instagram 전용으로만 큐잉을 시도한다. 영상이 없어 반려되면 그 주제는 버리고 다음
// 후보로 넘어간다 — "주제를 먼저 정하고 영상을 찾는" 게 아니라 "영상이 되는 주제가 나올 때까지
// 후보를 넘겨본다"는 점에서 CLAUDE.md의 "인스타는 영상부터" 원칙을 공유 로테이션을 건드리지
// 않고 만족시킨다. 시간은 사용자 지시대로 고정하지 않고 randomTimeInWindow가 "지금부터 오늘
// 자정까지" 중 무작위로 고른다(queue_topic.js의 window=[0,24] 클램핑 동작 재사용).
require('dotenv').config();
const log = require('../lib/logger');
const { loadQueue } = require('../lib/scheduler/queue');
const { fetchKoreaTravelTopics } = require('../lib/ingestion/korea_travel');
const { pickNextTopic, loadState, saveState } = require('../lib/scheduler/topic_rotation');
const { queueOneTopic } = require('../lib/scheduler/queue_topic');

// 2026-11-04 사용자 지시로 daily-auto-post.js의 POSTS_PER_DAY와 함께 2배로 — 이 스크립트는
// Instagram만 그 목표에 맞춰 보충하는 역할이라 값을 반드시 같이 맞춰야 한다.
const TARGET_PER_DAY = 6;
// 이 스크립트는 매 예약 발행 실행마다 다시 호출된다. 한 번에 후보 5개를 차례로
// 만들면 이미지·영상 검색과 품질 검사가 한 시간 넘게 이어져 다음 Windows 예약
// 실행이 기존 프로세스를 종료했다. 실행당 후보는 1개만 처리하고, 목표 미달분은
// 다음 예약 실행에서 이어서 시도해 API 호출과 실행 시간을 분산한다.
const MAX_ATTEMPTS = 1;

const todayCount = () => {
  const queue = loadQueue();
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayEnd = todayStart.getTime() + 24 * 3600 * 1000;
  return queue.filter((item) => {
    if (!(item.platforms || []).includes('instagram')) return false;
    if (item.status === 'rejected') return false;
    const t = Date.parse(item.scheduledAt);
    return t >= todayStart.getTime() && t < todayEnd;
  }).length;
};

const lastInstagramStatus = () => {
  const queue = loadQueue();
  for (let i = queue.length - 1; i >= 0; i -= 1) {
    if ((queue[i].platforms || []).includes('instagram')) return queue[i];
  }
  return null;
};

const main = async () => {
  const have = todayCount();
  log.section(`Instagram 하루 목표 확인 (오늘 ${have}/${TARGET_PER_DAY})`);
  if (have >= TARGET_PER_DAY) {
    log.ok('오늘 목표를 이미 채웠습니다 — 건너뜁니다.');
    return;
  }

  const topics = await fetchKoreaTravelTopics();
  let attempts = 0;
  while (todayCount() < TARGET_PER_DAY && attempts < MAX_ATTEMPTS) {
    attempts += 1;
    const historyLengthBefore = loadState().history.length;
    const topicAndSeed = pickNextTopic(topics, 'instagram-fill');
    log.ok(`시도 ${attempts}/${MAX_ATTEMPTS}: ${topicAndSeed.topic.source}`);
    try {
      await queueOneTopic(topicAndSeed, [0, 24], ['instagram']);
    } catch (err) {
      // 큐잉 자체가 실패하면(반려가 아니라 예외) 이 주제를 "쓴 것"으로 기록하지 않는다 —
      // 그래야 로테이션에서 공연히 건너뛰지 않고 다음 실행에서 같은 후보를 다시 시도한다.
      const state = loadState();
      state.history = state.history.slice(0, historyLengthBefore);
      saveState(state);
      throw err;
    }
    const latest = lastInstagramStatus();
    if (latest && latest.status === 'rejected') {
      log.warn(`반려(${latest.rejectedBy || latest.rejectReason || '사유 미상'}) — 다음 후보로 넘어갑니다.`);
    }
  }

  const finalCount = todayCount();
  if (finalCount >= TARGET_PER_DAY) {
    log.ok(`Instagram 오늘 목표 달성 (${finalCount}/${TARGET_PER_DAY}, 시도 ${attempts}회).`);
  } else {
    log.warn(`이번 후보가 영상 없음/품질게이트로 반려됨 — 현재 ${finalCount}/${TARGET_PER_DAY}, 다음 실행에서 다음 후보를 시도합니다.`);
  }
};

main().catch((err) => {
  log.err(`Instagram 하루 목표 보충 실패: ${err.message}`);
  process.exit(1);
});
