#!/usr/bin/env node
// 2026-11-09 사용자 지시: 페이스북이 가장 전환(링크 클릭)이 잘 되는 채널인데 하루 안전
// 한도(12건)의 1/4도 못 쓰고 있었다(공유 daily-auto-post 배치 4건 중 일부만 Facebook까지
// 성공) — ensure-instagram-daily.js/ensure-threads-daily.js와 같은 패턴으로, 공유 배치가
// Facebook 몫의 목표치에 못 미치면 이 스크립트가 로테이션에서 더 뽑아 채운다.
require('dotenv').config();
const log = require('../lib/logger');
const { loadQueue } = require('../lib/scheduler/queue');
const { fetchKoreaTravelTopics } = require('../lib/ingestion/korea_travel');
const { pickNextTopic, loadState, saveState } = require('../lib/scheduler/topic_rotation');
const { queueOneTopic } = require('../lib/scheduler/queue_topic');

// api_safety.js의 facebook dailyMax(12)보다 낮게 둬서 그 안전장치가 먼저 걸리지 않게 한다.
const TARGET_PER_DAY = 7;
// daily-auto-post.js와 같은 이유로 실행당 1건만 — 한 번에 여러 건을 만들면 이미지/영상
// 검색과 품질 검사가 길어져 다음 예약 실행이 기존 프로세스를 죽인다.
const MAX_ATTEMPTS = 1;

const todayCount = () => {
  const queue = loadQueue();
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayEnd = todayStart.getTime() + 24 * 3600 * 1000;
  return queue.filter((item) => {
    if (!(item.platforms || []).includes('facebook')) return false;
    if (item.status === 'rejected') return false;
    const t = Date.parse(item.scheduledAt);
    return t >= todayStart.getTime() && t < todayEnd;
  }).length;
};

const lastFacebookStatus = () => {
  const queue = loadQueue();
  for (let i = queue.length - 1; i >= 0; i -= 1) {
    if ((queue[i].platforms || []).includes('facebook')) return queue[i];
  }
  return null;
};

const main = async () => {
  const have = todayCount();
  log.section(`Facebook 하루 목표 확인 (오늘 ${have}/${TARGET_PER_DAY})`);
  if (have >= TARGET_PER_DAY) {
    log.ok('오늘 목표를 이미 채웠습니다 — 건너뜁니다.');
    return;
  }

  const topics = await fetchKoreaTravelTopics();
  let attempts = 0;
  while (todayCount() < TARGET_PER_DAY && attempts < MAX_ATTEMPTS) {
    attempts += 1;
    const historyLengthBefore = loadState().history.length;
    const topicAndSeed = pickNextTopic(topics, 'facebook-fill');
    log.ok(`시도 ${attempts}/${MAX_ATTEMPTS}: ${topicAndSeed.topic.source}`);
    try {
      await queueOneTopic(topicAndSeed, [0, 24], ['facebook']);
    } catch (err) {
      const state = loadState();
      state.history = state.history.slice(0, historyLengthBefore);
      saveState(state);
      throw err;
    }
    const latest = lastFacebookStatus();
    if (latest && latest.status === 'rejected') {
      log.warn(`반려(${latest.rejectedBy || latest.rejectReason || '사유 미상'}) — 다음 후보로 넘어갑니다.`);
    }
  }

  const finalCount = todayCount();
  if (finalCount >= TARGET_PER_DAY) {
    log.ok(`Facebook 오늘 목표 달성 (${finalCount}/${TARGET_PER_DAY}, 시도 ${attempts}회).`);
  } else {
    log.warn(`이번 후보가 품질게이트로 반려됨 — 현재 ${finalCount}/${TARGET_PER_DAY}, 다음 실행에서 다음 후보를 시도합니다.`);
  }
};

main().catch((err) => {
  log.err(`Facebook 하루 목표 보충 실패: ${err.message}`);
  process.exit(1);
});
