const axios = require('axios');
const sharp = require('sharp');
const log = require('../logger');

/**
 * Meta가 2026년 5월부터 사진/캐로셀에도 "재사용 콘텐츠" 단속을 확대했다 —
 * 컴퓨터 비전으로 구조적 유사성을 잡아내고, "실질적 편집"(내레이션·그래픽 추가) 없이
 * 재사용하면 도달이 줄어든다(30일 10건 이상이면 추천 노출 전체 배제). 워터마크/문구
 * 텍스트는 Meta가 정의하는 "그래픽 추가"에 해당해, 캡션에 새 글을 쓰는 것과 별개로
 * 이미지 자체에도 "실질적 편집" 신호를 남긴다. 사용자 요청(2026-08-29)으로 도입.
 *
 * 매번 랜덤 무료 스톡 사진의 실제 해상도가 다르므로, 배지 크기/폰트는 고정 픽셀이
 * 아니라 이미지 너비 비율로 계산해 어떤 사진에도 비율이 어색해지지 않게 한다.
 */
const BRAND_TEXT = 'Land in Korea · landinkorea.com';

const buildBadgeSvg = (imgWidth, imgHeight) => {
  const fontSize = Math.round(imgWidth * 0.024);
  const paddingX = Math.round(fontSize * 0.9);
  const paddingY = Math.round(fontSize * 0.55);
  const textWidth = Math.round(BRAND_TEXT.length * fontSize * 0.56);
  const badgeWidth = textWidth + paddingX * 2;
  const badgeHeight = fontSize + paddingY * 2;
  const margin = Math.round(imgWidth * 0.02);
  const x = imgWidth - badgeWidth - margin;
  const y = imgHeight - badgeHeight - margin;

  return {
    svg: Buffer.from(`
      <svg width="${imgWidth}" height="${imgHeight}" xmlns="http://www.w3.org/2000/svg">
        <rect x="${x}" y="${y}" width="${badgeWidth}" height="${badgeHeight}"
              rx="${Math.round(badgeHeight / 2)}" fill="black" fill-opacity="0.55" />
        <text x="${x + badgeWidth / 2}" y="${y + badgeHeight / 2}"
              font-family="Arial, Helvetica, sans-serif" font-weight="700"
              font-size="${fontSize}" fill="white"
              text-anchor="middle" dominant-baseline="central">${BRAND_TEXT}</text>
      </svg>
    `)
  };
};

/**
 * 이미지 URL을 받아 다운로드 -> 우측 하단에 브랜드 배지 합성 -> JPEG 버퍼로 반환합니다.
 * 실패하면 null을 반환합니다(호출부에서 원본 URL 그대로 쓰는 폴백 처리).
 */
const applyWatermark = async (imageUrl) => {
  try {
    const res = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 20000 });
    const image = sharp(Buffer.from(res.data));
    const metadata = await image.metadata();
    const { svg } = buildBadgeSvg(metadata.width, metadata.height);

    const buffer = await image
      .composite([{ input: svg, top: 0, left: 0 }])
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
