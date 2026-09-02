#!/usr/bin/env node
// TOPIC_IMAGES(최후의 폴백 — Pexels/Pixabay/Odii가 전부 실패했을 때만 쓰이는 대표
// 이미지)에 빠진 주제를 채우고, 서로 다른 주제가 같은 폴백 사진을 공유하는 중복도
// 재검색으로 해소한다(2026-09-02, verify-topic-media-alignment.js 점검 중 발견 —
// 이 폴백 자체가 없으면 라이브 검색이 다 실패하는 드문 경우에 Facebook은 텍스트만,
// Instagram은 발행 자체가 실패한다. 첫 실행에서 "Luggage storage"와 "KTX vs. SRT"가
// 우연히 같은 사진을 받는 걸 발견해 중복 해소 로직을 추가함). 전부 Pexels에서 실제로
// 검색해 구한다 — 지어내지 않는다.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const log = require('../lib/logger');
const { SOURCES } = require('../lib/ingestion/korea_travel');
const { TOPIC_IMAGES } = require('../lib/ingestion/topic_images');
const { TOPIC_QUERIES, findKoreaPhoto } = require('../lib/ingestion/pexels_image');

const TOPIC_IMAGES_PATH = path.join(__dirname, '..', 'lib', 'ingestion', 'topic_images.js');

const main = async () => {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    log.err('PEXELS_API_KEY가 없어 실행할 수 없습니다.');
    process.exit(1);
  }

  const missing = SOURCES.filter((s) => !TOPIC_IMAGES[s.topic]);
  log.section(`TOPIC_IMAGES 폴백 채우기 (${missing.length}개 주제)`);

  const filled = { ...TOPIC_IMAGES };
  // 서로 다른 주제가 같은 폴백 사진을 받으면 안 되므로(2026-09-02 실행에서
  // 실제로 "Luggage storage"와 "KTX vs. SRT"가 똑같은 사진을 받는 사고가 남),
  // 이미 채워진 URL(기존 값 + 이번 실행에서 새로 채운 값)을 전부 제외 목록으로 넘긴다.
  const usedUrls = Object.values(filled);
  for (const source of missing) {
    const queries = TOPIC_QUERIES[source.topic];
    if (!queries || !queries.length) {
      log.warn(`"${source.topic}": TOPIC_QUERIES도 없어 건너뜁니다.`);
      continue;
    }
    const url = await findKoreaPhoto(apiKey, queries[0], usedUrls);
    if (url) {
      filled[source.topic] = url;
      usedUrls.push(url);
      log.ok(`"${source.topic}" -> ${url}`);
    } else {
      log.warn(`"${source.topic}": 이미지를 찾지 못해 건너뜁니다.`);
    }
  }

  // 이미 TOPIC_IMAGES에 있던 항목끼리도 우연히 같은 사진일 수 있으니(관련 검색어가
  // 겹치면 Pexels가 같은 최상위 결과를 주는 경우가 실제로 있었다) 전체를 한 번 더
  // 훑어서 중복된 URL은 뒤에 나온 주제만 다시 검색해 교체한다.
  const seenUrls = new Set();
  for (const source of SOURCES) {
    const topic = source.topic;
    const url = filled[topic];
    if (!url) continue;
    if (!seenUrls.has(url)) {
      seenUrls.add(url);
      continue;
    }
    const queries = TOPIC_QUERIES[topic];
    if (!queries || !queries.length) {
      log.warn(`"${topic}": 다른 주제와 같은 폴백 사진인데 재검색할 TOPIC_QUERIES가 없어 그대로 둡니다.`);
      continue;
    }
    log.warn(`"${topic}": 다른 주제와 같은 폴백 사진(${url}) — 재검색합니다.`);
    const replacement = await findKoreaPhoto(apiKey, queries[0], [...seenUrls]);
    if (replacement) {
      filled[topic] = replacement;
      seenUrls.add(replacement);
      log.ok(`"${topic}" -> ${replacement} (중복 해소)`);
    } else {
      log.warn(`"${topic}": 대체 이미지를 찾지 못해 중복인 채로 둡니다.`);
    }
  }

  const body = Object.entries(filled)
    .map(([topic, url]) => `  ${JSON.stringify(topic)}: ${JSON.stringify(url)}`)
    .join(',\n');

  const fileContent = `/**\n * "Land in Korea" 주제별 대표 이미지 매핑 — 최후의 폴백(Pexels/Pixabay/Odii 라이브\n * 검색이 전부 실패했을 때만 사용됨).\n * korea_travel.js의 SOURCES[].topic 값과 동일한 키를 사용합니다.\n * 전부 Pexels에서 실제로 검색해 구한 사진입니다(2026-08-22 최초 4개는 Higgsfield\n * AI 생성 이미지였으나 실제 사진들과 안 어울린다는 지적으로 이후 전부 실사진으로\n * 전환, 2026-09-02 나머지 15개 주제도 동일 기준으로 채움).\n */\nconst TOPIC_IMAGES = {\n${body}\n};\n\nmodule.exports = { TOPIC_IMAGES };\n`;

  fs.writeFileSync(TOPIC_IMAGES_PATH, fileContent, 'utf8');
  log.ok(`topic_images.js 갱신 완료 — 총 ${Object.keys(filled).length}개 주제, 전부 서로 다른 사진.`);
};

main();
