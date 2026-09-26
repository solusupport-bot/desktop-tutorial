const fs = require('fs');
const path = require('path');
const axios = require('axios');

const EXT_MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp'
};

/**
 * 이미지를 http(s) URL 또는 로컬 파일 경로로 받아 base64 data URI로 반환한다.
 * 스크린샷 시점에 페이지가 원격 이미지 URL을 다시 fetch하지 않도록(네트워크 실패 시
 * 슬라이드가 깨지는 것을 막기 위해) HTML을 만들기 전에 미리 다운로드해 인라인으로 박아 넣는다
 * (watermark.js의 다운로드-후-합성 패턴과 동일).
 */
const loadImageAsDataUri = async (source) => {
  if (!source) return null;

  if (/^https?:\/\//i.test(source)) {
    const res = await axios.get(source, { responseType: 'arraybuffer', timeout: 20000 });
    const mime = res.headers['content-type'] || 'image/jpeg';
    return `data:${mime};base64,${Buffer.from(res.data).toString('base64')}`;
  }

  const abs = path.resolve(source);
  const buf = fs.readFileSync(abs);
  const mime = EXT_MIME[path.extname(abs).toLowerCase()] || 'image/jpeg';
  return `data:${mime};base64,${buf.toString('base64')}`;
};

module.exports = { loadImageAsDataUri };
