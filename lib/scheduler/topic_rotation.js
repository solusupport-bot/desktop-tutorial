const fs = require('fs');
const path = require('path');

const STATE_PATH = path.join(__dirname, '..', '..', 'data', 'topic_state.json');
// 이 값을 6 -> 14 -> 24 -> 120으로 계속 올려왔지만("주제는 계속 늘려간다"는 방침상
// 주제 풀이 앞으로도 계속 커질 것이므로), 고정 캡은 결국 또 모자라진다 — 실제로
// 2026-08-27~30 사이에만 이미지 21장이 이 캡 밖으로 밀려나 다시 게시됐다(2026-09-02
// 사용자가 실제 중복 게시물을 보고 "검증자 역할을 할 무언가가 필요하다"고 지적,
// data/queue.json 전수 분석으로 확인). 이미지/영상은 URL 문자열 목록일 뿐이라 계속
// 쌓아도 비용이 무시할 수준이므로, 캡을 없애고 "한 번이라도 쓴 건 앞으로 절대
// 다시 쓰지 않는다"는 영구 이력으로 바꾼다 — 이게 실질적인 중복 검증자 역할을 한다.
// 배경음악만은 검색 가능한 곡 풀 자체가 작아(Openverse 특정 무드) 무제한으로 하면
// "못 찾음"이 늘 수 있어 넉넉한 캡을 유지한다.
const MAX_RECENT_MUSIC = 300;

const loadState = () => {
  if (!fs.existsSync(STATE_PATH)) return {
    lastIndex: -1, history: [], recentImageUrls: [], recentVideoUrls: [], recentMusicUrls: []
  };
  const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  state.recentImageUrls = state.recentImageUrls || [];
  state.recentVideoUrls = state.recentVideoUrls || [];
  state.recentMusicUrls = state.recentMusicUrls || [];
  return state;
};

const saveState = (state) => {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
};

/** content가 배열(여러 각도)이면 seed로 하나를 골라 문자열로 확정합니다. */
const pickAngle = (content, seed) => (Array.isArray(content) ? content[seed % content.length] : content);

/**
 * topics 배열에서 각 주제가 history상 가장 최근에 등장한 위치(없으면 -1)를 찾아,
 * "가장 오래전에 쓴 주제(또는 한 번도 안 쓴 주제)" 순으로 정렬된 인덱스 목록을 반환합니다.
 * 인덱스 순환(lastIndex + 1) % topics.length) 대신 이 방식을 쓰는 이유: "Crowd forecasts"
 * 주제가 매 실행마다 조건부로 배열 끝에 붙었다 빠졌다 하면서 topics.length 자체가
 * 23~24 사이로 계속 바뀌었고, 그 결과 index 기반 순환이 완전히 어긋나 같은 주제가
 * 5~6일 만에 반복되는 사고가 실제로 발생했다(2026-09-09 사용자 지적: "중복된 주제
 * 중복된 사진 올리지마" — topic_state.json history 분석으로 확인). topic.source
 * 문자열로 "실제 언제 마지막으로 썼는지"를 직접 비교하면 배열 길이/순서가 매번
 * 달라지거나 동시 실행으로 상태가 꼬여도 같은 주제가 다른 주제들보다 먼저
 * 재선택되는 일이 없다.
 */
const rankByLeastRecentlyUsed = (topics, history) => {
  const lastSeenAt = {};
  history.forEach((h, i) => { lastSeenAt[h.topic] = i; });
  return topics
    .map((topic, i) => ({ i, topic, lastSeen: lastSeenAt[topic.source] ?? -1 }))
    .sort((a, b) => a.lastSeen - b.lastSeen);
};

/**
 * 주제 배열에서 "다음 주제"를 하나씩 반환합니다 — 지금까지 쓴 적이 없거나 가장
 * 오래전에 쓴 주제를 우선합니다. 같은 주제를 다시 다룰 때 문구가 겹치지 않도록
 * seed(지금까지 누적 게시 횟수)로 (1) 콘텐츠 각도, (2) 질문/CTA 문구, (3) 이미지
 * 검색어를 모두 다르게 회전시킵니다.
 * 상태는 data/topic_state.json에 저장되어 매일 실행해도 순서가 이어집니다.
 */
const pickNextTopic = (topics) => {
  const state = loadState();
  const ranked = rankByLeastRecentlyUsed(topics, state.history);
  const { i: nextIndex, topic } = ranked[0];
  const seed = state.history.length;

  state.lastIndex = nextIndex;
  state.history = [...state.history, { index: nextIndex, topic: topic.source, at: new Date().toISOString() }].slice(-200);
  saveState(state);

  return { topic: { ...topic, content: pickAngle(topic.content, seed) }, seed };
};

/** 지금까지 쓴 적 있는 이미지 URL 전체 목록(중복 방지용, 영구 이력)을 반환합니다. */
const getRecentImageUrls = () => loadState().recentImageUrls;

/** 이번에 사용한 이미지 URL을 영구 기록해 앞으로 절대 다시 고르지 않게 합니다. */
const recordImageUrl = (url) => {
  if (!url) return;
  const state = loadState();
  if (!state.recentImageUrls.includes(url)) state.recentImageUrls.push(url);
  saveState(state);
};

/** 지금까지 쓴 적 있는 영상 URL 전체 목록(중복 방지용, 영구 이력) — 사진과 동일한 규칙. */
const getRecentVideoUrls = () => loadState().recentVideoUrls;

const recordVideoUrl = (url) => {
  if (!url) return;
  const state = loadState();
  if (!state.recentVideoUrls.includes(url)) state.recentVideoUrls.push(url);
  saveState(state);
};

/** 최근 사용한 배경음악 URL 목록(중복 방지용) — 곡 풀이 작아 영구 이력 대신 넉넉한 캡만 유지. */
const getRecentMusicUrls = () => loadState().recentMusicUrls;

const recordMusicUrl = (url) => {
  if (!url) return;
  const state = loadState();
  state.recentMusicUrls = [...state.recentMusicUrls, url].slice(-MAX_RECENT_MUSIC);
  saveState(state);
};

/**
 * pickNextTopic처럼 상태를 변경(저장)하지 않고, 앞으로 count번 pickNextTopic을
 * 불렀을 때 나올 결과를 미리 내다본다. 자동화 실행 전에 다가올 주제/seed를 알아야
 * 그 콘텐츠를 미리 써서 큐(prewritten_content.js)에 채워둘 수 있다(2026-08-30).
 */
const peekUpcomingTopics = (topics, count) => {
  const state = loadState();
  const simulatedHistory = [...state.history];
  const results = [];
  for (let i = 0; i < count; i += 1) {
    const ranked = rankByLeastRecentlyUsed(topics, simulatedHistory);
    const { topic } = ranked[0];
    const seed = simulatedHistory.length;
    simulatedHistory.push({ topic: topic.source, at: new Date().toISOString() });
    results.push({
      seed,
      source: topic.source,
      author: topic.author,
      url: topic.url,
      category: topic.category,
      placeKeyword: topic.placeKeyword,
      content: pickAngle(topic.content, seed)
    });
  }
  return results;
};

module.exports = {
  pickNextTopic,
  peekUpcomingTopics,
  getRecentImageUrls,
  recordImageUrl,
  getRecentVideoUrls,
  recordVideoUrl,
  getRecentMusicUrls,
  recordMusicUrl,
  loadState,
  saveState,
  STATE_PATH
};
