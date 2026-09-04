#!/usr/bin/env node
// Pinterest 자격증명(PINTEREST_ACCESS_TOKEN, PINTEREST_BOARD_ID)이 실제로 작동하는지
// 확인하는 1회성 테스트 스크립트. daily-auto-post.js 전체 파이프라인을 돌리지 않고
// lib/publishing/pinterest.js만 독립적으로 호출한다.
require('dotenv').config();
const log = require('../lib/logger');
const { publishToPinterest } = require('../lib/publishing/pinterest');

const main = async () => {
  const result = await publishToPinterest({
    text: 'Korea Travel Tip: T-money 교통카드 하나면 서울 지하철, 버스, 편의점 결제까지 다 됩니다. 공항 편의점에서 3,000원에 바로 구매 가능해요.',
    imageUrls: ['https://images.pexels.com/photos/7237170/pexels-photo-7237170.jpeg'],
    blogUrl: 'https://landinkorea.com/blog/tmoney-first-timer-mistake.html?utm_source=pinterest&utm_medium=social&utm_campaign=test',
    topic: 'T-money transit card'
  });

  if (!result || result.id === 'mock_pinterest_pin_id') {
    log.err('Pinterest 자격증명이 인식되지 않았거나 발행 실패 (모의 발행으로 대체됨)');
    process.exitCode = 1;
    return;
  }

  log.ok(`Pinterest 테스트 발행 성공: ${result.url || result.id}`);
  console.log('RESULT_JSON=' + JSON.stringify(result));
};

main();
