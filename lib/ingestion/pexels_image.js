const axios = require('axios');
const log = require('../logger');

const PEXELS_SEARCH_URL = 'https://api.pexels.com/v1/search';

// 주제별 실제 사진 검색어. korea_travel.js의 SOURCES[].topic과 키를 맞춥니다.
const TOPIC_QUERIES = {
  'eSIM & mobile data': 'airport terminal travelers phone',
  'T-money transit card': 'seoul subway station platform',
  'Tax refund (Tax Free) shopping': 'shopping street city daytime',
  'Travel advisories & safety notices': 'city skyline night lights',
  'Airport transfer options': 'airport train station',
  'First-timer etiquette & common mistakes': 'traditional korean restaurant interior'
};

/**
 * 주제에 맞는 실제 사진 한 장을 Pexels에서 검색해 URL을 반환합니다.
 * PEXELS_API_KEY가 없거나 검색 결과가 없으면 null을 반환합니다(호출부에서 폴백 처리).
 */
const fetchTopicImage = async (topic) => {
  const apiKey = process.env.PEXELS_API_KEY;
  const query = TOPIC_QUERIES[topic];

  if (!apiKey || !query) {
    log.warn(`PEXELS_API_KEY 또는 "${topic}" 검색어가 없어 이미지 검색을 건너뜁니다.`);
    return null;
  }

  try {
    const res = await axios.get(PEXELS_SEARCH_URL, {
      headers: { Authorization: apiKey },
      params: { query, per_page: 1, orientation: 'portrait' },
      timeout: 10000
    });
    const photo = res.data?.photos?.[0];
    if (!photo) {
      log.warn(`Pexels에서 "${query}" 검색 결과가 없습니다.`);
      return null;
    }
    log.ok(`Pexels 이미지 확보: "${query}" -> ${photo.url}`);
    return photo.src.large;
  } catch (err) {
    log.err(`Pexels 이미지 검색 실패: ${err.response?.data?.error || err.message}`);
    return null;
  }
};

module.exports = { fetchTopicImage, TOPIC_QUERIES };
