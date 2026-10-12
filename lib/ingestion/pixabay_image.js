const axios = require('axios');
const log = require('../logger');
const { isUsed } = require('./media_guard');
const { OTHER_COUNTRY } = require('./topic_match');

const PIXABAY_SEARCH_URL = 'https://pixabay.com/api/';

// pexels_image.js와 동일한 신호 — Pixabay는 alt 설명 대신 tags(쉼표 구분 문자열)를 준다.
const KOREA_SIGNAL = /korea|korean|seoul|incheon|busan|hanok|k-pop/i;
// 2026-10-13 사용자 결정(2번): 한 단계 낮춤 — SNS는 1080px로 표시되므로 눈에 띄는 차이 없음. 이보다 더 낮추지 말 것.
const MIN_ORIGINAL_WIDTH = 2000;

/**
 * Pexels 후보 풀이 부족할 때 보충하는 2차 무료 이미지 소스입니다(2026-08-29, 사용자 요청 —
 * "무료 API 이미지 사이트를 더 추가하면 중복 문제가 해결될 것 같다"). Pexels와 완전히
 * 별개의 카탈로그라 겹칠 일이 없어 실질적으로 후보 풀 자체를 늘려줍니다.
 * PIXABAY_API_KEY가 없으면 null을 반환해 조용히 건너뜁니다(Pexels만으로도 동작은 함).
 */
const findKoreaPhotoPixabay = async (apiKey, rawQuery, recentUrls = []) => {
  if (!apiKey) return null;
  const query = `south korea ${rawQuery}`;

  try {
    const res = await axios.get(PIXABAY_SEARCH_URL, {
      params: {
        key: apiKey,
        q: query,
        image_type: 'photo',
        orientation: 'horizontal',
        safesearch: 'true',
        per_page: 50
      },
      timeout: 15000
    });
    const hits = res.data?.hits || [];
    if (!hits.length) {
      log.warn(`Pixabay "${query}"로 이미지를 찾지 못했습니다.`);
      return null;
    }

    for (const hit of hits) {
      if ((hit.imageWidth || 0) < MIN_ORIGINAL_WIDTH) continue;
      // Pixabay 사진 주소는 호출마다 바뀌는 임시 주소라 고유번호를 #fragment로 붙여 중복 검사가 가능하게 한다.
      const url = `${hit.largeImageURL}#pixabay=${hit.id}`;
      if (isUsed(recentUrls, url)) continue;
      if (OTHER_COUNTRY.test(hit.tags || '')) continue;
      if (!KOREA_SIGNAL.test(hit.tags || '')) continue;
      log.ok(`Pixabay 한국 확인 이미지 확보: "${query}" (${hit.imageWidth}px, tags="${hit.tags}") -> ${hit.pageURL}`);
      return url;
    }

    log.warn(`Pixabay "${query}" 태그에서 한국 신호를 확인 못해 건너뜁니다.`);
    return null;
  } catch (err) {
    log.err(`Pixabay 이미지 검색 실패: ${err.response?.data || err.message}`);
    return null;
  }
};

module.exports = { findKoreaPhotoPixabay };
