const path = require('path');
const { PALETTE, TEXT_ON, FONTS, GOOGLE_FONTS_URL, CANVAS, SAFE_MARGIN, PAGE_TOTAL } = require('./palette');
const { loadImageAsDataUri } = require('./load_image');

const LOGO_PATH = path.join(__dirname, '..', '..', '..', 'assets', 'logo-mark.png');

const escapeHtml = (str = '') =>
  String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

// 줄바꿈은 브라우저 레이아웃 엔진이 알아서 처리하므로(수동 wrap 불필요), 원문에 있는
// 개행만 <br>로 살려준다.
const toHtmlParagraph = (str = '') => escapeHtml(str).replace(/\n/g, '<br>');

const baseStyle = (backgroundHex) => `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: ${CANVAS.width}px;
    height: ${CANVAS.height}px;
    overflow: hidden;
    background: ${backgroundHex};
    font-family: ${FONTS.BODY};
  }
  .canvas { position: relative; width: ${CANVAS.width}px; height: ${CANVAS.height}px; }
  .safe {
    position: absolute;
    left: ${SAFE_MARGIN}px;
    right: ${SAFE_MARGIN}px;
    top: ${SAFE_MARGIN}px;
    bottom: ${SAFE_MARGIN}px;
  }
  .page-indicator {
    position: absolute;
    right: ${SAFE_MARGIN}px;
    bottom: 40px;
    font-family: ${FONTS.BODY};
    font-weight: 600;
    font-size: 22px;
    letter-spacing: 0.02em;
  }
  .wordmark {
    position: absolute;
    left: ${SAFE_MARGIN}px;
    top: 32px;
    font-family: ${FONTS.BODY};
    font-weight: 600;
    font-size: 20px;
    letter-spacing: 0.02em;
  }
  .logo {
    position: absolute;
    left: ${SAFE_MARGIN}px;
    bottom: 32px;
    width: 72px;
    height: 72px;
    object-fit: contain;
  }
  .headline { font-family: ${FONTS.HEADLINE}; }
`;

const buildDocument = ({ backgroundHex, bodyHtml }) => `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="${GOOGLE_FONTS_URL}">
<style>${baseStyle(backgroundHex)}</style>
</head>
<body>${bodyHtml}</body>
</html>`;

const pageIndicator = (page, color) =>
  `<div class="page-indicator" style="color:${color}">${page}/${PAGE_TOTAL}</div>`;

const wordmark = (color) =>
  `<div class="wordmark" style="color:${color}">LAND IN KOREA</div>`;

const logoTag = (logoDataUri) => (logoDataUri ? `<img class="logo" src="${logoDataUri}">` : '');

// 슬라이드 텍스트는 korea_travel.js의 실제 문장을 그대로 쓰므로 길이가 주제마다
// 들쭉날쭉하다(지어내서 줄이지 않는다는 원칙상 문장 자체를 잘라 맞추지 않는다) — 대신
// 글자 수 구간별로 폰트 크기를 낮춰서, 긴 문장이 세이프존을 넘기거나 커버 슬라이드에서
// 사진이 안 보일 정도로 헤드라인이 차지하는 것을 막는다.
const scaledFontSize = (text, tiers) => {
  const len = String(text || '').replace(/\n/g, ' ').length;
  const tier = tiers.find((t) => len <= t.maxLen);
  return (tier || tiers[tiers.length - 1]).size;
};

const COVER_HEADLINE_TIERS = [
  { maxLen: 50, size: 80 },
  { maxLen: 90, size: 64 },
  { maxLen: 140, size: 52 },
  { maxLen: 200, size: 42 },
  { maxLen: Infinity, size: 34 }
];

const CONTEXT_BODY_TIERS = [
  { maxLen: 90, size: 52 },
  { maxLen: 150, size: 42 },
  { maxLen: 220, size: 34 },
  { maxLen: Infinity, size: 28 }
];

const TIP_BODY_TIERS = [
  { maxLen: 110, size: 34 },
  { maxLen: 180, size: 28 },
  { maxLen: 260, size: 24 },
  { maxLen: Infinity, size: 20 }
];

// --- 슬라이드 1: 커버 ---------------------------------------------------
const buildCoverBody = async (slide) => {
  const imageDataUri = await loadImageAsDataUri(slide.image);
  const logoDataUri = await loadImageAsDataUri(LOGO_PATH);
  const textColor = PALETTE.WHITE;

  return `
  <div class="canvas">
    ${imageDataUri ? `<img src="${imageDataUri}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;">` : ''}
    <div style="position:absolute;inset:0;background:linear-gradient(to top, rgba(11,29,58,0.88) 0%, rgba(11,29,58,0.45) 45%, rgba(11,29,58,0.05) 70%);"></div>
    <div class="safe" style="display:flex;flex-direction:column;justify-content:flex-end;">
      <div style="font-family:${FONTS.BODY};font-weight:700;font-size:24px;letter-spacing:0.08em;color:${PALETTE.GOLD};margin-bottom:20px;">
        ${toHtmlParagraph(slide.topicLabel)}
      </div>
      <div class="headline" style="font-weight:700;font-size:${scaledFontSize(slide.hook, COVER_HEADLINE_TIERS)}px;line-height:1.15;color:${textColor};margin-bottom:96px;">
        ${toHtmlParagraph(slide.hook)}
      </div>
    </div>
    ${logoTag(logoDataUri)}
    ${pageIndicator(slide.page, textColor)}
  </div>`;
};

// --- 슬라이드 2: 맥락(텍스트 전용) ---------------------------------------
const buildTextBody = async (slide) => {
  const bg = PALETTE[slide.background];
  const textColor = TEXT_ON[slide.background];

  return `
  <div class="canvas">
    ${wordmark(textColor)}
    <div class="safe" style="display:flex;align-items:center;">
      <div class="headline" style="font-weight:500;font-size:${scaledFontSize(slide.body, CONTEXT_BODY_TIERS)}px;line-height:1.4;color:${textColor};">
        ${toHtmlParagraph(slide.body)}
      </div>
    </div>
    ${pageIndicator(slide.page, textColor)}
  </div>`;
};

// --- 슬라이드 3, 5, 6: 팁 ------------------------------------------------
const buildTipBody = async (slide) => {
  const bg = PALETTE[slide.background];
  const textColor = TEXT_ON[slide.background];

  return `
  <div class="canvas">
    ${wordmark(textColor)}
    <div class="safe" style="display:flex;flex-direction:column;justify-content:center;">
      <div class="headline" style="font-weight:700;font-size:140px;line-height:1;color:${textColor};opacity:0.35;margin-bottom:24px;">
        ${escapeHtml(slide.number)}
      </div>
      <div class="headline" style="font-weight:500;font-size:52px;line-height:1.25;color:${textColor};margin-bottom:28px;">
        ${toHtmlParagraph(slide.title)}
      </div>
      <div style="font-family:${FONTS.BODY};font-weight:400;font-size:${scaledFontSize(slide.body, TIP_BODY_TIERS)}px;line-height:1.45;color:${textColor};max-width:880px;">
        ${toHtmlParagraph(slide.body)}
      </div>
    </div>
    ${pageIndicator(slide.page, textColor)}
  </div>`;
};

// --- 슬라이드 4, 7: 근거 사진 --------------------------------------------
const buildPhotoBody = async (slide) => {
  const imageDataUri = await loadImageAsDataUri(slide.image);
  const logoDataUri = await loadImageAsDataUri(LOGO_PATH);
  const textColor = PALETTE.WHITE;

  return `
  <div class="canvas">
    ${imageDataUri ? `<img src="${imageDataUri}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;">` : ''}
    ${logoDataUri ? `<img src="${logoDataUri}" style="position:absolute;top:${SAFE_MARGIN}px;right:${SAFE_MARGIN}px;width:96px;height:auto;">` : ''}
    <div style="position:absolute;left:0;right:0;bottom:0;height:150px;background:rgba(11,29,58,0.78);display:flex;align-items:center;padding:0 ${SAFE_MARGIN}px;">
      <div style="font-family:${FONTS.BODY};font-weight:600;font-size:26px;color:${textColor};">
        ${toHtmlParagraph(slide.caption)}
      </div>
    </div>
    ${pageIndicator(slide.page, textColor)}
  </div>`;
};

// --- 슬라이드 8: 주의사항 -------------------------------------------------
const buildCautionBody = async (slide) => {
  const textColor = PALETTE.WHITE;

  return `
  <div class="canvas">
    ${wordmark(textColor)}
    <div class="safe" style="display:flex;flex-direction:column;justify-content:center;">
      <div style="font-family:${FONTS.BODY};font-weight:700;font-size:24px;letter-spacing:0.08em;color:${PALETTE.NAVY};background:${PALETTE.WHITE};display:inline-block;padding:10px 20px;border-radius:999px;margin-bottom:28px;width:fit-content;">
        WATCH OUT
      </div>
      <div class="headline" style="font-weight:500;font-size:52px;line-height:1.3;color:${textColor};margin-bottom:28px;">
        ${toHtmlParagraph(slide.title)}
      </div>
      <div style="font-family:${FONTS.BODY};font-weight:400;font-size:${scaledFontSize(slide.body, TIP_BODY_TIERS)}px;line-height:1.45;color:${textColor};max-width:880px;">
        ${toHtmlParagraph(slide.body)}
      </div>
    </div>
    ${pageIndicator(slide.page, textColor)}
  </div>`;
};

// --- 슬라이드 9: 클로징/CTA -----------------------------------------------
const buildClosingBody = async (slide) => {
  const logoDataUri = await loadImageAsDataUri(LOGO_PATH);
  const textColor = PALETTE.WHITE;

  return `
  <div class="canvas">
    <div class="safe" style="display:flex;flex-direction:column;justify-content:center;">
      <div class="headline" style="font-weight:700;font-size:64px;line-height:1.15;color:${textColor};margin-bottom:28px;">
        ${toHtmlParagraph(slide.headline)}
      </div>
      <div style="font-family:${FONTS.BODY};font-weight:400;font-size:32px;line-height:1.45;color:${PALETTE.CREAM};max-width:880px;">
        ${toHtmlParagraph(slide.body)}
      </div>
    </div>
    ${logoTag(logoDataUri)}
    ${pageIndicator(slide.page, textColor)}
  </div>`;
};

const BUILDERS = {
  cover: buildCoverBody,
  text: buildTextBody,
  tip: buildTipBody,
  photo: buildPhotoBody,
  caution: buildCautionBody,
  closing: buildClosingBody
};

/**
 * 슬라이드 설명 객체(slides.js가 만든 것) 하나를 완성된 HTML 문서로 만든다.
 * 이미지는 이 단계에서 미리 data URI로 인라인되므로, 완성된 HTML은 외부 네트워크 없이
 * (Google Fonts 스타일시트 제외) 그 자체로 완결된 스크린샷 대상이 된다.
 */
const buildSlideHtml = async (slide) => {
  const builder = BUILDERS[slide.type];
  if (!builder) throw new Error(`알 수 없는 슬라이드 타입: ${slide.type}`);

  const backgroundHex = slide.background ? PALETTE[slide.background] : PALETTE.NAVY;
  const bodyHtml = await builder(slide);
  return buildDocument({ backgroundHex, bodyHtml });
};

module.exports = { buildSlideHtml };
