const axios = require('axios');
const sharp = require('sharp');
const log = require('../logger');

/**
 * Facebook 앨범(attached_media)은 피드에서 배열의 첫 장이 사실상 커버 썸네일로
 * 노출된다(lib/publishing/facebook.js) — 후보 이미지들을 다운받아 밝기(RGB 채널
 * 평균)와 대비(채널 표준편차 평균)를 sharp로 측정해, 가장 밝고 대비가 강한 사진을
 * 맨 앞으로 옮긴다. watermark.js가 이미 쓰는 것과 같은 axios+sharp 다운로드 패턴이다.
 * 개별 이미지 분석이 실패하면 점수 0으로 취급되어 순서에서 밀려날 뿐, 전체가 실패하면
 * (전부 0점) 원래 순서를 그대로 유지한다 — 앨범 자체가 비는 일은 없다.
 */
const scoreImageVividness = async (imageUrl) => {
  try {
    const res = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 15000 });
    const stats = await sharp(Buffer.from(res.data)).stats();
    const rgb = stats.channels.slice(0, 3);
    const brightness = rgb.reduce((sum, c) => sum + c.mean, 0) / rgb.length;
    const contrast = rgb.reduce((sum, c) => sum + c.stdev, 0) / rgb.length;
    return brightness * 0.6 + contrast * 0.4;
  } catch (err) {
    log.warn(`이미지 밝기/대비 분석 실패, 기본 순서로 취급: ${err.message}`);
    return 0;
  }
};

const orderByVividness = async (imageUrls) => {
  if (!imageUrls || imageUrls.length < 2) return imageUrls;
  const scored = await Promise.all(
    imageUrls.map(async (url) => ({ url, score: await scoreImageVividness(url) }))
  );
  const best = scored.reduce((a, b) => (b.score > a.score ? b : a));
  if (best.score === 0) return imageUrls;
  return [best.url, ...imageUrls.filter((url) => url !== best.url)];
};

module.exports = { orderByVividness };
