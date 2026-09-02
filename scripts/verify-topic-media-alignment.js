#!/usr/bin/env node
// 검증자 스크립트: 본문(캡션)과 이미지/영상이 서로 다른 걸 가리키는 사고를 막는다
// (2026-09-02 사용자 지적: "본문과 영상과 이미지가 맞지 않을 수 있는데 이것을
// 검증할 것을 만들던지"). 실제로 이번 세션에서 이런 버그가 한 번 났었다 —
// 관광지 주제 6개를 korea_travel.js에 추가하면서 lib/ingestion/pexels_image.js의
// TOPIC_QUERIES에 대응 항목을 빠뜨려서, "이미지 없음" 상태로 발행될 뻔했다.
// 이 스크립트는 그 버그 클래스를 구조적으로(사람이 또 깜빡해도) 잡아낸다:
//
// 1. SOURCES의 모든 주제가 TOPIC_QUERIES에도 키가 있는지
// 2. 그 주제의 콘텐츠 각도 개수(content.length)와 이미지 검색어 배열 길이
//    (TOPIC_QUERIES[topic].length)가 정확히 같은지 — 다르면 seed % length가
//    서로 어긋나서(예: 콘텐츠는 seed%2, 이미지는 seed%3) 본문 각도와 이미지가
//    실제로 안 맞는 조합이 나올 수 있다(주석에도 명시된 불변식).
//
// 실행: node scripts/verify-topic-media-alignment.js
// 종료 코드: 문제 있으면 1, 없으면 0.
const log = require('../lib/logger');
const { SOURCES } = require('../lib/ingestion/korea_travel');
const { TOPIC_QUERIES } = require('../lib/ingestion/pexels_image');

const main = () => {
  const problems = [];

  SOURCES.forEach((source) => {
    const topicName = source.topic;
    const contentCount = Array.isArray(source.content) ? source.content.length : 1;
    const queries = TOPIC_QUERIES[topicName];

    if (!queries) {
      problems.push(`"${topicName}": TOPIC_QUERIES에 항목이 없음 — 이 주제는 이미지 없이 발행됨(관광지면 Odii 폴백만 의존).`);
      return;
    }
    if (queries.length !== contentCount) {
      problems.push(
        `"${topicName}": 콘텐츠 각도 ${contentCount}개인데 이미지 검색어는 ${queries.length}개 — `
        + `seed % ${contentCount}(본문)와 seed % ${queries.length}(이미지)가 어긋나 본문과 안 맞는 사진이 나올 수 있음.`
      );
    }
  });

  if (!problems.length) {
    log.ok(`주제-이미지 정렬 검증 통과 — ${SOURCES.length}개 주제 전부 본문 각도 수와 이미지 검색어 수가 일치.`);
    process.exit(0);
  }

  log.err(`주제-이미지 정렬 문제 ${problems.length}건 발견:`);
  problems.forEach((p) => log.warn(p));
  process.exit(1);
};

main();
