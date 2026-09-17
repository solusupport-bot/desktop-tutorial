#!/usr/bin/env node
// 2026-09-17 사용자 요청: "주제가 떨어지면 자동생성, 좀 뾰족하게" — topic_bank.json이
// 목표 풀 사이즈보다 작으면 Claude로 새 주제를 채운다. daily-topic.yml에서 주제를
// 고르기 전에 실행해, 오늘 새로 생성된 주제도 바로 로테이션 후보에 들어가게 한다.
//
// "뾰족하게": 기존 주제 중 "KTX vs. SRT vs. intercity bus", "Seoul attraction pass
// comparison", "Korean public holidays that disrupt travel plans" 같은 결정/실수 회피형
// 주제가 단일 명소 이름("Gyeongbokgung Palace")보다 더 구체적이고 실질적이라 판단해,
// 새 주제는 이 스타일을 따르게 한다. category/placeKeyword는 일부러 안 채운다 — attraction
// 카테고리 주제는 lib/media/topic_music.js의 ATTRACTION_MOODS에 무드 매핑을 같이
// 추가해야 하는데 이 스크립트가 거기까지 손대면 범위가 커지고 위험해진다.
//
// 실행: node scripts/generate-topics.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const log = require('../lib/logger');
const { askClaudeForJSON } = require('../lib/ai/claude');

const TOPIC_BANK_PATH = path.join(__dirname, '..', 'data', 'topic_bank.json');
const TOPIC_QUERIES_PATH = path.join(__dirname, '..', 'lib', 'ingestion', 'pexels_image.js');
const TARGET_POOL_SIZE = 50;
const MAX_NEW_PER_RUN = 5;
const DEFAULT_URL = 'https://english.visitkorea.or.kr';

// 2026-09-17 실측 버그: 처음엔 topic_bank.json만 채우고 lib/ingestion/pexels_image.js의
// TOPIC_QUERIES는 손대지 않았다 — fetchTopicImage(s)는 TOPIC_QUERIES[topic]이 없으면
// (video 검색과 달리 주제명으로 폴백하지 않고) 이미지 없이 빈 배열을 반환한다
// (verify-topic-media-alignment.js가 이걸 실제로 잡아냈다: 생성된 5개 전부 "이미지
// 없이 발행됨"). content 각도와 1:1 대응하는 검색어를 같이 생성해서 반드시 같이 채운다.
const GENERATE_PROMPT = (existingTopics, count) => `You write topic ideas for "Land in Korea", an English-language social account helping first-time visitors and foreign residents navigate practical life in Korea.

Generate exactly ${count} NEW topic ideas. Requirements:
- Sharp and specific, not a generic single-attraction name. Model these three existing topics: "KTX vs. SRT vs. intercity bus for long-distance travel", "Seoul attraction pass comparison", "Korean public holidays that disrupt travel plans" — each frames a real decision, trade-off, or mistake first-timers make, not just "here's a place".
- Must NOT duplicate or closely overlap any of these existing topics:
${existingTopics.map((t) => `- ${t}`).join('\n')}
- Stay within practical travel/living-in-Korea territory: transit, money, apps, etiquette, seasonal planning, comparisons between options, common first-timer mistakes, lesser-known practical details about well-known places or services.
- Each topic needs exactly 2 content "angles" — each a short paragraph (3-5 sentences) of genuinely useful, widely-known, verifiable facts (no invented statistics, prices, or specific numbers you're not confident are broadly true). These angles are the raw source material a caption gets built from later, so they should read like a knowledgeable local explaining something, not marketing copy.
- Each topic also needs exactly 2 "imageQueries", one per angle IN THE SAME ORDER, for photo search — short (4-7 words), visually concrete (a real scene, place, or object a photographer could shoot), and each one MUST include an explicit Korea signal word ("korea", "seoul", or "korean").

Respond ONLY with this JSON shape (no explanation, no code fences):
{"topics": [{"topic": "...", "url": "a real, plausible reference URL for this topic", "content": ["angle 1", "angle 2"], "imageQueries": ["query for angle 1", "query for angle 2"]}]}`;

/** lib/ingestion/pexels_image.js의 TOPIC_QUERIES 객체 맨 앞에 새 항목들을 텍스트로 삽입한다. */
const appendTopicQueries = (newEntries) => {
  if (!newEntries.length) return;
  const src = fs.readFileSync(TOPIC_QUERIES_PATH, 'utf8');
  const marker = 'const TOPIC_QUERIES = {';
  const idx = src.indexOf(marker);
  if (idx === -1) throw new Error('TOPIC_QUERIES 선언을 찾지 못했습니다 — 수동으로 추가하세요.');
  const insertPoint = idx + marker.length;
  const block = newEntries
    .map(({ topic, queries }) => `\n  ${JSON.stringify(topic)}: [\n${queries.map((q) => `    ${JSON.stringify(q)}`).join(',\n')}\n  ],`)
    .join('');
  const patched = src.slice(0, insertPoint) + block + src.slice(insertPoint);
  fs.writeFileSync(TOPIC_QUERIES_PATH, patched, 'utf8');
};

const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const main = async () => {
  const bank = JSON.parse(fs.readFileSync(TOPIC_BANK_PATH, 'utf8'));
  const needed = TARGET_POOL_SIZE - bank.length;
  if (needed <= 0) {
    log.ok(`주제 ${bank.length}개 — 목표(${TARGET_POOL_SIZE}개) 이상이라 생성을 건너뜁니다.`);
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    log.warn('ANTHROPIC_API_KEY가 없어 주제 자동생성을 건너뜁니다.');
    return;
  }

  const count = Math.min(needed, MAX_NEW_PER_RUN);
  log.section(`새 주제 생성 (현재 ${bank.length}개, 목표 ${TARGET_POOL_SIZE}개, 이번에 ${count}개)`);

  const result = await askClaudeForJSON(GENERATE_PROMPT(bank.map((t) => t.topic), count));
  if (!result || !Array.isArray(result.topics)) {
    log.err('주제 생성 응답 형식이 올바르지 않습니다.');
    return;
  }

  const existingNormalized = new Set(bank.map((t) => normalize(t.topic)));
  const newQueries = [];
  let added = 0;
  result.topics.forEach((t) => {
    if (!t.topic || !Array.isArray(t.content) || !t.content.length
      || !Array.isArray(t.imageQueries) || t.imageQueries.length !== t.content.length) {
      log.warn(`형식이 이상하거나 content/imageQueries 길이가 안 맞아 건너뜁니다: ${JSON.stringify(t).slice(0, 100)}`);
      return;
    }
    const key = normalize(t.topic);
    if (existingNormalized.has(key)) {
      log.warn(`이미 있는(또는 겹치는) 주제라 건너뜁니다: "${t.topic}"`);
      return;
    }
    existingNormalized.add(key);
    bank.push({
      topic: t.topic,
      author: 'Land in Korea Desk',
      url: t.url || DEFAULT_URL,
      content: t.content
    });
    newQueries.push({
      topic: t.topic,
      queries: t.imageQueries.map((q) => (/korea|seoul|korean/i.test(q) ? q : `${q} south korea`))
    });
    added += 1;
    log.ok(`추가: "${t.topic}"`);
  });

  if (added === 0) {
    log.warn('추가된 주제가 없습니다.');
    return;
  }

  fs.writeFileSync(TOPIC_BANK_PATH, JSON.stringify(bank, null, 2) + '\n', 'utf8');
  appendTopicQueries(newQueries);
  log.ok(`주제 ${added}개 추가 완료 (총 ${bank.length}개) — 이미지 검색어도 같이 등록함.`);
};

main().catch((err) => {
  log.err(`주제 자동생성 실패: ${err.message}`);
  process.exit(1);
});
