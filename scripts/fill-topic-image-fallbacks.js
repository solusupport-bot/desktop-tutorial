#!/usr/bin/env node
// 일회성 스크립트: TOPIC_IMAGES(최후의 폴백 — Pexels/Pixabay/Odii가 전부 실패했을 때만
// 쓰이는 대표 이미지)에 빠져 있는 주제 15개를 채운다(2026-09-02,
// verify-topic-media-alignment.js 계열 점검 중 발견 — 이 폴백 자체가 없으면 라이브
// 검색이 다 실패하는 드문 경우에 Facebook은 텍스트만, Instagram은 발행 자체가
// 실패한다). 기존 4개 항목은 Higgsfield AI 생성 이미지였지만, 실제 사진과 안
// 어울린다는 지적으로 이후 전부 Pexels 실사진으로 전환됐으므로 새로 채우는 것도
// 동일하게 Pexels에서 실제로 검색해 구한다 — 지어내지 않는다.
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
  for (const source of missing) {
    const queries = TOPIC_QUERIES[source.topic];
    if (!queries || !queries.length) {
      log.warn(`"${source.topic}": TOPIC_QUERIES도 없어 건너뜁니다.`);
      continue;
    }
    const url = await findKoreaPhoto(apiKey, queries[0], []);
    if (url) {
      filled[source.topic] = url;
      log.ok(`"${source.topic}" -> ${url}`);
    } else {
      log.warn(`"${source.topic}": 이미지를 찾지 못해 건너뜁니다.`);
    }
  }

  const body = Object.entries(filled)
    .map(([topic, url]) => `  ${JSON.stringify(topic)}: ${JSON.stringify(url)}`)
    .join(',\n');

  const fileContent = `/**\n * "Land in Korea" 주제별 대표 이미지 매핑 — 최후의 폴백(Pexels/Pixabay/Odii 라이브\n * 검색이 전부 실패했을 때만 사용됨).\n * korea_travel.js의 SOURCES[].topic 값과 동일한 키를 사용합니다.\n * 전부 Pexels에서 실제로 검색해 구한 사진입니다(2026-08-22 최초 4개는 Higgsfield\n * AI 생성 이미지였으나 실제 사진들과 안 어울린다는 지적으로 이후 전부 실사진으로\n * 전환, 2026-09-02 나머지 15개 주제도 동일 기준으로 채움).\n */\nconst TOPIC_IMAGES = {\n${body}\n};\n\nmodule.exports = { TOPIC_IMAGES };\n`;

  fs.writeFileSync(TOPIC_IMAGES_PATH, fileContent, 'utf8');
  log.ok(`${Object.keys(filled).length - Object.keys(TOPIC_IMAGES).length}개 항목 새로 채워 topic_images.js 갱신 완료.`);
};

main();
