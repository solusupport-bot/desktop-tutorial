const path = require('path');
const axios = require('axios');
const sharp = require('sharp');
const log = require('../logger');

/**
 * Meta가 2026년 5월부터 사진/캐로셀에도 "재사용 콘텐츠" 단속을 확대했다 —
 * 컴퓨터 비전으로 구조적 유사성을 잡아내고, "실질적 편집"(내레이션·그래픽 추가) 없이
 * 재사용하면 도달이 줄어든다(30일 10건 이상이면 추천 노출 전체 배제). 워터마크는
 * Meta가 정의하는 "그래픽 추가"에 해당해, 캡션 문구와 별개로 이미지 자체에도
 * "실질적 편집" 신호를 남긴다. 사용자 요청(2026-08-29)으로 도입.
 *
 * 로고(assets/logo-mark.png)를 그대로 써서 실제 브랜드 아이콘 + 잉크블랙/골드 톤의
 * 한국적 색감으로 디자인했다(사용자 요청 — 텍스트만 있던 첫 버전 대신 로고 아이콘을
 * 넣어달라고 함). 이 아이콘 파일 자체는 최초 1회만 로고에서 배경을 투명하게 잘라
 * 만들어둔 고정 에셋이고, 매 사진마다 하는 작업은 이 아이콘+텍스트를 합성하는
 * 가벼운 로컬 이미지 연산뿐이라 AI 토큰 비용이 전혀 들지 않는다.
 */
const BRAND_TEXT = 'Land in Korea · landinkorea.com';
const LOGO_MARK_PATH = path.join(__dirname, '..', '..', 'assets', 'logo-mark.png');
const LOGO_ASPECT_RATIO = 246 / 300; // assets/logo-mark.png 실제 비율(가로 300 x 세로 246)

// 로고에서 실측한 색(잉크블랙 라인아트 + 크림 배경) 기준 — 순수 검정 필 대신
// 로고와 같은 계열의 잉크블랙을 쓰고, 단청(dancheong) 색인 골드 라인으로 테두리를 둘러
// "한국적 감성"을 더한다(2026-08-29 사용자 요청).
const INK_BLACK = '#1c1712';
const GOLD_ACCENT = '#c9a24a';

const buildBadgeLayers = async (imgWidth, imgHeight) => {
  const badgeHeight = Math.round(imgWidth * 0.052);
  const iconHeight = Math.round(badgeHeight * 0.72);
  const iconWidth = Math.round(iconHeight / LOGO_ASPECT_RATIO);
  const paddingX = Math.round(badgeHeight * 0.28);
  const gap = Math.round(badgeHeight * 0.22);
  const fontSize = Math.round(badgeHeight * 0.34);
  const textWidth = Math.round(BRAND_TEXT.length * fontSize * 0.56);
  const badgeWidth = paddingX * 2 + iconWidth + gap + textWidth;
  const margin = Math.round(imgWidth * 0.02);
  const x = imgWidth - badgeWidth - margin;
  const y = imgHeight - badgeHeight - margin;

  const pillSvg = Buffer.from(`
    <svg width="${imgWidth}" height="${imgHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect x="${x}" y="${y}" width="${badgeWidth}" height="${badgeHeight}"
            rx="${Math.round(badgeHeight / 2)}" fill="${INK_BLACK}" fill-opacity="0.82"
            stroke="${GOLD_ACCENT}" stroke-opacity="0.85" stroke-width="${Math.max(1, Math.round(badgeHeight * 0.03))}" />
      <text x="${x + paddingX + iconWidth + gap}" y="${y + badgeHeight / 2}"
            font-family="Arial, Helvetica, sans-serif" font-weight="700"
            font-size="${fontSize}" fill="white"
            text-anchor="start" dominant-baseline="central">${BRAND_TEXT}</text>
    </svg>
  `);

  const iconBuffer = await sharp(LOGO_MARK_PATH).resize({ width: iconWidth, height: iconHeight }).toBuffer();

  return [
    { input: pillSvg, top: 0, left: 0 },
    { input: iconBuffer, top: y + Math.round((badgeHeight - iconHeight) / 2), left: x + paddingX }
  ];
};

/**
 * 이미지 URL을 받아 다운로드 -> 우측 하단에 로고 아이콘+브랜드 배지 합성 -> JPEG 버퍼로
 * 반환합니다. 실패하면 null을 반환합니다(호출부에서 원본 URL 그대로 쓰는 폴백 처리).
 */
const applyWatermark = async (imageUrl) => {
  try {
    const res = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 20000 });
    const image = sharp(Buffer.from(res.data));
    const metadata = await image.metadata();
    const layers = await buildBadgeLayers(metadata.width, metadata.height);

    const buffer = await image
      .composite(layers)
      .jpeg({ quality: 90 })
      .toBuffer();

    log.ok(`워터마크 합성 완료 (${metadata.width}x${metadata.height})`);
    return buffer;
  } catch (err) {
    log.err(`워터마크 합성 실패: ${err.message}`);
    return null;
  }
};

module.exports = { applyWatermark, BRAND_TEXT };
