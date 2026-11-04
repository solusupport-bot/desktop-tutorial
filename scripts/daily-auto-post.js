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
const { pickNextTopic, loadState, saveState } = require('../lib/scheduler/topic_rotation');
const { queueOneTopic, PLATFORMS } = require('../lib/scheduler/queue_topic');

// 2026-11-04 사용자 지시: 게시량 2배로 (api_safety.js의 dailyMax도 같이 올렸음 — 안 그러면
// threads/instagram처럼 하루 한도가 낮은 플랫폼은 큐에만 쌓이고 안 나간다).
const POSTS_PER_DAY = 6;

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
// 주제가 그대로 2배로 큐잉된다. 오늘 UTC 날짜로 이미 큐잉한 "성공" 기록 수를 세서,
// 하루 목표(POSTS_PER_DAY)에 못 미친 만큼만 이어서 큐잉한다 — 몇 번을 재시도로
// 트리거해도 하루 최대 POSTS_PER_DAY개만 실제로 큐잉되게 한다.
// 2026-10-30 발견: ensure-instagram-daily.js도 같은 pickNextTopic/history를 15분마다
// 호출하면서, source 구분 없이 "오늘 이력 있음"만 보던 이 체크가 그 Instagram 전용
// 시도만으로 항상 true가 돼 10/24 이후 daily-auto-post가 계속 조용히 스킵됐다
// (threads/facebook/bluesky/mastodon/reddit/tumblr가 6일간 새 글을 못 받음) —
// 이 스크립트(daily)가 직접 남긴 history만 센다.
// 2026-11-02 발견: pickNextTopic은 주제를 "고르자마자" history에 기록하는데,
// 그 뒤 queueOneTopic이 실패(OOM, 네트워크 끊김, 인증 만료 등)하면 아무것도 큐잉되지
// 않았는데도 history엔 "오늘 큐잉함"이 남아 그날 전체가 조용히 막혀버렸다(실제로
// 같은 날 두 번 발생, 사람이 history를 수동으로 지워야만 재시도됨). 실패하면 방금
// 추가된 history 항목을 되돌려서 그 주제도, 그날의 남은 몫도 다음 실행에서 정상
// 재시도되게 한다.
const queuedTodayCount = () => {
  const { history } = loadState();
  const today = new Date().toISOString().slice(0, 10);
  return history.filter((h) => h.source === 'daily' && h.at && h.at.slice(0, 10) === today).length;
};

const main = async () => {
  log.section(`Land in Korea 일일 자동 발행 (하루 ${POSTS_PER_DAY}건, 24시간 랜덤 분산)`);

  const already = queuedTodayCount();
  const remaining = POSTS_PER_DAY - already;
  if (remaining <= 0) {
    log.ok(`오늘(UTC) 이미 ${already}개를 큐잉했습니다 — 백업 재실행 안전을 위해 건너뜁니다.`);
    return;
  }
  if (already > 0) {
    log.ok(`오늘 ${already}개는 이미 큐잉됨 — 나머지 ${remaining}개만 이어서 큐잉합니다.`);
  }

  const topics = await fetchKoreaTravelTopics();
  for (let i = 0; i < remaining; i += 1) {
    const windowIndex = (already + i) % DAY_WINDOWS_HOURS.length;
    const historyLengthBefore = loadState().history.length;
    const topicAndSeed = pickNextTopic(topics, 'daily');
    try {
      await queueOneTopic(topicAndSeed, DAY_WINDOWS_HOURS[windowIndex]);
    } catch (err) {
      const state = loadState();
      state.history = state.history.slice(0, historyLengthBefore);
      saveState(state);
      log.err(`주제 "${topicAndSeed.topic.source}" 큐잉 실패 — 선택 기록을 되돌리고 다음 실행에서 재시도합니다.`);
      throw err;
    }
  }

  log.ok(`오늘 ${remaining}개 주제를 ${PLATFORMS.join(', ')} 채널에 하루 안에서 랜덤 시각으로 예약했습니다.`);
};

main().catch((err) => {
  log.err(`일일 자동 발행 실패: ${err.message}`);
  process.exit(1);
});
