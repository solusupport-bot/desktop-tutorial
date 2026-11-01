const axios = require('axios');
const log = require('../logger');
const { isUsed } = require('./media_guard');
const { OTHER_COUNTRY } = require('./topic_match');

const UNSPLASH_SEARCH_URL = 'https://api.unsplash.com/search/photos';

// pexels_image.js/pixabay_image.js와 동일한 신호 — Unsplash는 alt_description/description
// 텍스트만 준다(태그 필드 없음).
const KOREA_SIGNAL = /korea|korean|seoul|incheon|busan|hanok|k-pop/i;
// Unsplash 원본은 보통 매우 고해상도라 이 기준에 거의 항상 통과한다(2026-10-18 사용자 지적
// "완성도" 대응 — Pexels/Pixabay 대비 큐레이션 품질이 더 좋다는 전제로 추가).
const MIN_ORIGINAL_WIDTH = 2000;

/**
 * 2026-10-18: 사용자가 "무료 툴(Pexels/Pixabay)만 쓰면 완성도가 떨어지지 않냐"고 지적해
 * 추가한 3번째 무료 이미지 소스. Pexels/Pixabay와 완전히 별개 카탈로그라 후보 풀을 늘려주고,
 * 미학/감성 사진 큐레이션 품질이 대체로 더 좋다. UNSPLASH_ACCESS_KEY가 없으면 null을
 * 반환해 조용히 건너뛴다(다른 소스만으로도 동작은 함).
 * Unsplash API 가이드라인(필수): 실제로 쓰는 사진은 links.download_location을 한 번
 * GET해서 다운로드를 등록해야 한다(표시만 하는 것과 구분) — 안 하면 가이드라인 위반이다.
 */
const findKoreaPhotoUnsplash = async (apiKey, rawQuery, recentUrls = []) => {
  if (!apiKey) return null;
  const query = `south korea ${rawQuery}`;

  try {
    const res = await axios.get(UNSPLASH_SEARCH_URL, {
      headers: { Authorization: `Client-ID ${apiKey}` },
      params: { query, per_page: 30, orientation: 'landscape' },
      timeout: 15000
    });
    const results = res.data?.results || [];
    if (!results.length) {
      log.warn(`Unsplash "${query}"로 이미지를 찾지 못했습니다.`);
      return null;
    }

    for (const photo of results) {
      if ((photo.width || 0) < MIN_ORIGINAL_WIDTH) continue;
      const url = `${photo.urls?.regular}#unsplash=${photo.id}`;
      if (isUsed(recentUrls, url)) continue;
      const text = `${photo.alt_description || ''} ${photo.description || ''}`;
      if (OTHER_COUNTRY.test(text)) continue;
      if (!KOREA_SIGNAL.test(text)) continue;

      // 가이드라인 필수: 실제 사용으로 확정된 사진은 다운로드를 등록한다.
      if (photo.links?.download_location) {
        try {
          await axios.get(photo.links.download_location, { headers: { Authorization: `Client-ID ${apiKey}` }, timeout: 10000 });
        } catch (err) {
          log.warn(`Unsplash 다운로드 등록 실패(계속 진행): ${err.message}`);
        }
      }

      log.ok(`Unsplash 한국 확인 이미지 확보: "${query}" (${photo.width}px, alt="${photo.alt_description || ''}") -> ${photo.links?.html}`);
      return url;
    }

    log.warn(`Unsplash "${query}" 설명에서 한국 신호를 확인 못해 건너뜁니다.`);
    return null;
  } catch (err) {
    log.err(`Unsplash 이미지 검색 실패: ${err.response?.data?.errors || err.message}`);
    return null;
  }
};

module.exports = { findKoreaPhotoUnsplash };
