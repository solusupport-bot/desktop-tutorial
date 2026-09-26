const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const log = require('../../logger');
const { CANVAS, PAGE_TOTAL } = require('./palette');
const { buildSlideDescriptors } = require('./slides');
const { buildSlideHtml } = require('./html');

/**
 * 크로미움 실행 파일 경로를 환경변수로 오버라이드할 수 있게 한다. Playwright가 설치한
 * 브라우저 리비전과 실행 환경에 이미 있는 크로미움 리비전이 어긋나는 경우
 * (예: 이 저장소 CI 이미지에 미리 설치된 버전과 package.json의 playwright 버전이
 * 다를 때) `npx playwright install chromium`을 매번 새로 받는 대신 이 값으로
 * 우회할 수 있다. 평소(로컬 PC에서 `npx playwright install chromium`을 정상적으로
 * 한 번 돌린 경우)에는 비워두면 Playwright가 알아서 찾는다.
 */
const launchBrowser = () => {
  const executablePath = process.env.CARD_NEWS_CHROMIUM_PATH || undefined;
  return chromium.launch({ executablePath });
};

/**
 * 카드뉴스 콘텐츠 객체 하나를 받아 9장의 PNG로 렌더링해 outDir에 저장한다.
 * 반환값은 저장된 파일 경로 배열(01-cover.png 순서 그대로).
 */
const renderCardNewsSet = async ({ content, outDir }) => {
  const slides = buildSlideDescriptors(content);
  fs.mkdirSync(outDir, { recursive: true });

  log.section(`카드뉴스 렌더링 시작 (${slides.length}장 → ${outDir})`);

  const browser = await launchBrowser();
  const files = [];
  try {
    const page = await browser.newPage({
      viewport: { width: CANVAS.width, height: CANVAS.height },
      deviceScaleFactor: 1
    });

    for (const slide of slides) {
      const html = await buildSlideHtml(slide);
      await page.setContent(html, { waitUntil: 'networkidle' });
      // Google Fonts 스타일시트가 networkidle 이후에도 폰트 페이스 로딩을 비동기로
      // 마무리하는 경우가 있어, 실제로 폰트가 준비될 때까지 한 번 더 기다린다.
      await page.evaluate(() => document.fonts.ready);

      const filePath = path.join(outDir, slide.filename);
      await page.screenshot({ path: filePath, type: 'png' });
      files.push(filePath);
      log.ok(`  [${slide.page}/${PAGE_TOTAL}] ${slide.filename} 저장 완료`);
    }
  } finally {
    await browser.close();
  }

  log.ok(`카드뉴스 렌더링 완료: ${files.length}장`);
  return files;
};

module.exports = { renderCardNewsSet };
