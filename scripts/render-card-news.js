#!/usr/bin/env node
// "주제 -> 9슬라이드 카드뉴스" 파이프라인을 처음부터 끝까지 돌려보는 스크립트.
// 텍스트 매핑은 lib/media/card_news/content_map.js(reshapeByTemplate과 같은 원칙:
// korea_travel.js의 실제 문장만 재배치, 지어내지 않음), 렌더링은
// lib/media/card_news/render.js(Playwright 스크린샷)가 담당한다.
//
// 사용법:
//   node scripts/render-card-news.js                         # 기본 주제, Pexels 이미지(키 있으면)
//   node scripts/render-card-news.js --topic "Jeju Island"    # 다른 주제
//   node scripts/render-card-news.js --out DIR                # 출력 폴더 지정
require('dotenv').config();
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const log = require('../lib/logger');
const { renderCardNewsSet, buildCardNewsContent, CANVAS } = require('../lib/media/card_news');
const { fetchKoreaTravelTopics } = require('../lib/ingestion/korea_travel');

const DEFAULT_TOPIC = 'Namdaemun Market';

// PEXELS_API_KEY가 없거나 외부 이미지 호스트에 접근할 수 없는 환경(예: 이 렌더러를 처음
// 테스트하는 네트워크 제한 샌드박스)에서도 파이프라인 전체(콘텐츠 매핑 + 렌더링)를
// 검증할 수 있도록, 로컬에서 단색 이미지를 즉석에서 만들어 buildCardNewsContent에
// 직접 주입한다. 실제 발행용 세트는 반드시 PEXELS_API_KEY를 설정해 real 이미지를
// 쓰게 해야 한다(이 자리표시자를 그대로 발행하지 말 것).
const buildPlaceholderImages = async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'card-news-placeholder-'));
  const colors = [
    { r: 11, g: 29, b: 58 },   // NAVY 톤 자리표시자 (커버)
    { r: 62, g: 124, b: 177 }, // BLUE 톤 자리표시자 (본문 사진1)
    { r: 244, g: 183, b: 64 }  // GOLD 톤 자리표시자 (본문 사진2)
  ];
  const files = [];
  for (let i = 0; i < colors.length; i += 1) {
    const filePath = path.join(dir, `placeholder-${i}.jpg`);
    await sharp({
      create: { width: CANVAS.width, height: CANVAS.height, channels: 3, background: colors[i] }
    }).jpeg({ quality: 90 }).toFile(filePath);
    files.push(filePath);
  }
  return files;
};

const parseArgs = () => {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf('--out');
  const topicIndex = args.indexOf('--topic');
  return {
    outDir: outIndex >= 0 ? args[outIndex + 1] : null,
    topic: topicIndex >= 0 ? args[topicIndex + 1] : DEFAULT_TOPIC
  };
};

const main = async () => {
  const { outDir: outDirArg, topic: topicName } = parseArgs();

  log.section(`"${topicName}" 주제 로드`);
  const topics = await fetchKoreaTravelTopics();
  const topicItem = topics.find((t) => t.source === topicName);
  if (!topicItem) {
    throw new Error(`"${topicName}" 주제를 lib/ingestion/korea_travel.js에서 찾을 수 없습니다.`);
  }

  const mapOptions = { seed: 0 };
  if (!process.env.PEXELS_API_KEY) {
    log.warn('PEXELS_API_KEY가 없어 로컬 자리표시자 이미지로 대체합니다(발행용 아님, 파이프라인 테스트 전용).');
    mapOptions.images = await buildPlaceholderImages();
  }

  log.section('주제 -> 9슬라이드 콘텐츠 매핑');
  const content = await buildCardNewsContent(topicItem, mapOptions);

  const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const slug = topicName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const outDir = outDirArg || path.join(__dirname, '..', 'output', 'card-news', `${slug}-${dateStamp}`);

  const files = await renderCardNewsSet({ content, outDir });

  log.section('완료');
  files.forEach((f) => log.ok(f));
};

main().catch((err) => {
  log.err(`카드뉴스 렌더링 실패: ${err.message}`);
  process.exit(1);
});
