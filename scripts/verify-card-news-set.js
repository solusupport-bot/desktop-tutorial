#!/usr/bin/env node
// 검증자 스크립트: 카드뉴스 렌더링 결과 폴더 하나가 CARD_DESIGN_SPEC.md 구조를
// 그대로 따르는지 확인한다(파일 9개, 정확한 이름, 정확한 1080x1350 캔버스, 빈 화면
// 아님). scripts/verify-topic-media-alignment.js / verify-no-duplicate-media.js와
// 같은 계열의 "발행 전 하드 게이트" — scripts/queue-card-news.js가 업로드 전에
// 자동으로 호출하지만, 렌더만 해보고 수동으로 확인할 때도 이 스크립트를 바로 쓸 수 있다.
//
// 실행: node scripts/verify-card-news-set.js <output/card-news/주제-날짜 폴더>
// 종료 코드: 문제 있으면 1, 없으면 0.
const log = require('../lib/logger');
const { verifyCardNewsSet } = require('../lib/media/card_news/verify');

const dir = process.argv[2];
if (!dir) {
  log.err('사용법: node scripts/verify-card-news-set.js <폴더>');
  process.exit(1);
}

verifyCardNewsSet(dir).then(({ ok, problems }) => {
  if (ok) {
    log.ok(`카드뉴스 세트 검증 통과: ${dir}`);
    process.exit(0);
  }
  log.err(`카드뉴스 세트 검증 실패 (${problems.length}건): ${dir}`);
  problems.forEach((p) => log.warn(p));
  process.exit(1);
});
