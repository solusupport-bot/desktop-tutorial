#!/usr/bin/env node
// 카드뉴스 한 세트를 실제 발행 큐(data/queue.json)에 등록하는 스크립트.
//
// 파이프라인: 주제 로드 -> 9슬라이드 콘텐츠 매핑(content_map.js, 지어내지 않음) ->
// 렌더링(render.js, Playwright) -> 구조 검증(verify.js — 실패하면 여기서 중단하고
// 업로드/큐 등록으로 넘어가지 않는다, CLAUDE.md의 "발행 전 하드 게이트" 원칙과 동일)
// -> landinkorea.com에 9장 업로드(media_host.js) -> Instagram 캐로셀로 큐 등록.
//
// 실제 Meta API 호출(발행)은 이 스크립트가 하지 않는다 — 기존과 동일하게
// scripts/publish-claimed-posts.js(scheduler.yml/local-cron이 주기적으로 실행)가
// 예약 시각이 되면 큐에서 꺼내 발행한다. run.js/lib/publishing/instagram.js는
// imageUrls가 여러 장이면 이미 캐로셀로 처리하므로 이 스크립트 쪽 변경은 필요 없다.
//
// 사전 준비(전부 사용자 로컬 PC 전제 — 이 저장소의 다른 SNS 발행 스크립트와 동일):
//   - PEXELS_API_KEY (실제 한국 확인 이미지 3장 확보용, 없으면 에러로 중단)
//   - landinkorea.com Netlify 사이트 로컬 클론(LANDINKOREA_SITE_DIR) + netlify CLI 로그인
//   - GROQ_API_KEY(선택) — 없으면 Instagram 캡션은 규칙 기반 템플릿으로 대체됨
//
// 사용법:
//   node scripts/queue-card-news.js --topic "Namdaemun Market"
//   node scripts/queue-card-news.js --topic "Jeju Island" --seed 3
//   node scripts/queue-card-news.js --topic "Jeju Island" --dry-run   # 렌더+검증까지만, 업로드/큐 등록 안 함
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const log = require('../lib/logger');
const { fetchKoreaTravelTopics } = require('../lib/ingestion/korea_travel');
const { renderCardNewsSet, buildCardNewsContent, verifyCardNewsSet } = require('../lib/media/card_news');
const { uploadMediaFiles } = require('../lib/publishing/media_host');
const { curateContent } = require('../lib/curation/curate');
const { pickAngle } = require('../lib/scheduler/topic_rotation');
const { addPost } = require('../lib/scheduler/queue');

const parseArgs = () => {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : null;
  };
  return {
    topic: get('--topic'),
    seed: Number(get('--seed') || 0),
    dryRun: args.includes('--dry-run')
  };
};

const main = async () => {
  const { topic: topicName, seed, dryRun } = parseArgs();
  if (!topicName) {
    log.err('사용법: node scripts/queue-card-news.js --topic "<주제명>" [--seed N] [--dry-run]');
    process.exit(1);
  }

  log.section(`"${topicName}" 주제 로드`);
  const topics = await fetchKoreaTravelTopics();
  const topicItem = topics.find((t) => t.source === topicName);
  if (!topicItem) {
    throw new Error(`"${topicName}" 주제를 lib/ingestion/korea_travel.js에서 찾을 수 없습니다.`);
  }

  log.section('주제 -> 9슬라이드 콘텐츠 매핑');
  const content = await buildCardNewsContent(topicItem, { seed });

  const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const slug = topicName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const setName = `${slug}-${dateStamp}`;
  const outDir = path.join(__dirname, '..', 'output', 'card-news', setName);

  const files = await renderCardNewsSet({ content, outDir });

  log.section('렌더링 결과 구조 검증');
  const { ok, problems } = await verifyCardNewsSet(outDir);
  if (!ok) {
    problems.forEach((p) => log.warn(p));
    throw new Error(`카드뉴스 세트 검증 실패 (${problems.length}건) — 업로드/큐 등록을 중단합니다.`);
  }
  log.ok('구조 검증 통과 (9장, 1080x1350, 빈 화면 없음)');

  if (dryRun) {
    log.section('--dry-run: 업로드/큐 등록 생략');
    log.ok(`렌더링 결과: ${outDir}`);
    return;
  }

  log.section('landinkorea.com에 9장 업로드');
  const uploadFiles = files.map((filePath) => ({
    buffer: fs.readFileSync(filePath),
    relativePath: `card-news/${setName}/${path.basename(filePath)}`
  }));
  const imageUrls = await uploadMediaFiles(uploadFiles);

  log.section('Instagram 캡션 생성');
  // curateContent(reshapeByTemplate)는 content가 단일 문자열이어야 한다 — korea_travel.js
  // 원본처럼 여러 각도 배열 그대로 넘기면 splitSentences가 배열에 .replace를 호출해
  // 터진다(topic_rotation.js의 pickNextTopic이 항상 이렇게 미리 골라주기 때문에 실제
  // 자동화 경로에서는 안 드러났던 버그). buildCardNewsContent는 여러 각도를 다 합쳐
  // 써야 해서 topicItem을 그대로 넘기지만, 캡션은 다른 자리에서 쓰는 문구라 여기서만
  // seed로 각도 하나를 확정한다.
  const captionSourceItem = { ...topicItem, content: pickAngle(topicItem.content, seed) };
  const curated = await curateContent(captionSourceItem, ['instagram'], seed);

  // sourceImageUrls에는 카드에 실제로 박아 넣은 원본 Pexels 사진(3장)만 남긴다 —
  // scripts/verify-no-duplicate-media.js가 이 필드를 그대로 읽어 다른 발행 건과
  // 같은 원본 사진을 재사용했는지 검사하므로(코드 수정 없이 카드뉴스도 자동으로
  // 커버됨), 렌더링된 최종 PNG(imageUrls)가 아니라 반드시 원본 사진 URL이어야 한다.
  const sourceImageUrls = [content.coverImage, content.photo1.image, content.photo2.image]
    .filter((u) => /^https?:\/\//i.test(u));

  const queued = addPost({
    text: curated.instagram,
    imageUrls,
    platforms: ['instagram'],
    topic: topicItem.source,
    sourceImageUrls,
    cardNewsSet: setName
  });

  log.section('완료');
  log.ok(`큐 등록: ${queued.id} (캐로셀 ${imageUrls.length}장, 예약 ${queued.scheduledAt})`);
};

main().catch((err) => {
  log.err(`카드뉴스 큐 등록 실패: ${err.message}`);
  process.exit(1);
});
