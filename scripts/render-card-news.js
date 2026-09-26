#!/usr/bin/env node
// 카드뉴스 렌더링 파이프라인(lib/media/card_news)의 동작을 확인하기 위한 데모 스크립트.
//
// 여기서 만드는 "content" 객체(hook/tip 문구)는 lib/ingestion/korea_travel.js의
// 'Namdaemun Market' 실제 팩트 문장을 그대로 요약/재배치한 것이다 — Threads/Facebook
// 캡션을 만들 때(lib/curation/curate.js)와 똑같이 사실을 재구성만 했을 뿐, 지어낸
// 정보는 없다. 이 스크립트 자체가 "주제 → 카드뉴스 콘텐츠"를 자동으로 만들어주는
// 것은 아니다(그건 CARD_DESIGN_SPEC.md §9 체크리스트의 다음 단계) — 지금은 렌더러가
// 스펙대로 9장을 정확히 찍어내는지 확인하는 용도.
//
// 사용법:
//   node scripts/render-card-news.js            # Pexels 이미지(키 있으면) + 데모 텍스트
//   node scripts/render-card-news.js --out DIR   # 출력 폴더 지정
require('dotenv').config();
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const log = require('../lib/logger');
const { renderCardNewsSet, CANVAS } = require('../lib/media/card_news');
const { fetchTopicImages } = require('../lib/ingestion/pexels_image');

const TOPIC = 'Namdaemun Market';

// PEXELS_API_KEY가 없거나 외부 이미지 호스트에 접근할 수 없는 환경(예: 이 렌더러를 처음
// 테스트하는 네트워크 제한 샌드박스)에서도 렌더러 자체는 검증할 수 있도록, 로컬에서
// 단색 이미지를 즉석에서 만들어 쓴다. 실제 발행용 세트를 만들 때는 반드시
// fetchTopicImages가 돌려주는 한국 확인 이미지를 써야 한다(이 자리표시자를 그대로
// 발행하지 말 것).
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

const buildDemoContent = (images) => ({
  topicLabel: 'NAMDAEMUN MARKET',
  hook: 'Everyone treats Namdaemun like an extension of Myeongdong.\nIt isn’t.',
  coverImage: images[0],
  context:
    'Namdaemun has operated on this site since the early 1400s — Korea’s largest traditional market, a 10-minute walk from Myeongdong but a completely different kind of shopping.',
  tip1: {
    title: 'It runs on wholesale hours',
    body: 'Many sections open as late as 10PM–5AM on a wholesale schedule, not tourist hours. Sundays are noticeably quieter.'
  },
  photo1: { image: images[1], caption: 'Namdaemun Market, Seoul' },
  tip2: {
    title: 'Bargaining is normal here',
    body: 'There’s no entrance fee, but unlike Myeongdong’s fixed-price stores, bargaining is expected — bring cash.'
  },
  tip3: {
    title: 'Tax Free isn’t guaranteed',
    body: 'Smaller independent stalls are far less likely to be affiliated with a refund network than bigger Myeongdong stores.'
  },
  photo2: { image: images[2], caption: 'Namdaemun Market street food stalls, Seoul' },
  caution: {
    title: 'Check the sticker before you buy',
    body: 'Most first-timers assume the Tax Free sticker system is universal and find out otherwise mid-purchase.'
  },
  closing: {
    headline: 'Save this before your next Seoul shopping trip',
    body: 'More Korea travel tips on the blog — link in bio.'
  }
});

const parseArgs = () => {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf('--out');
  const outDir = outIndex >= 0 ? args[outIndex + 1] : null;
  return { outDir };
};

const main = async () => {
  const { outDir: outDirArg } = parseArgs();

  let images = [];
  if (process.env.PEXELS_API_KEY) {
    log.section(`"${TOPIC}" Pexels 이미지 3장 조회`);
    const fetched = await fetchTopicImages(TOPIC, [], 0, 2);
    images = [fetched[0], ...fetched].filter(Boolean); // 커버 + 본문 2장(첫 장 재사용)
  }
  if (images.length < 3) {
    log.warn('PEXELS_API_KEY가 없거나 이미지 확보에 실패해 로컬 자리표시자 이미지로 대체합니다(발행용 아님, 렌더러 테스트 전용).');
    images = await buildPlaceholderImages();
  }

  const content = buildDemoContent(images);
  const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const slug = TOPIC.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const outDir = outDirArg || path.join(__dirname, '..', 'output', 'card-news', `${slug}-${dateStamp}`);

  const files = await renderCardNewsSet({ content, outDir });

  log.section('완료');
  files.forEach((f) => log.ok(f));
};

main().catch((err) => {
  log.err(`카드뉴스 렌더링 실패: ${err.message}`);
  process.exit(1);
});
