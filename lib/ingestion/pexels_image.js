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
 *
 * recentUrls에 최근 사용한 이미지 URL 목록을 넘기면, 그 목록에 없는 사진이 나올 때까지
 * 검색 결과 페이지를 바꿔가며 최대 5번 재시도합니다 (같은 주제를 다시 다뤄도 같은 사진이
 * 반복되지 않도록 하기 위함).
 */
const fetchTopicImage = async (topic, recentUrls = []) => {
  const apiKey = process.env.PEXELS_API_KEY;
  const query = TOPIC_QUERIES[topic];

  if (!apiKey || !query) {
    log.warn(`PEXELS_API_KEY 또는 "${topic}" 검색어가 없어 이미지 검색을 건너뜁니다.`);
    return null;
  }

  for (let page = 1; page <= 5; page += 1) {
    try {
      const res = await axios.get(PEXELS_SEARCH_URL, {
        headers: { Authorization: apiKey },
        params: { query, per_page: 1, page, orientation: 'portrait' },
        timeout: 10000
      });
      const photo = res.data?.photos?.[0];
      if (!photo) {
        log.warn(`Pexels에서 "${query}" 검색 결과가 없습니다(page ${page}).`);
        return null;
      }
      if (!recentUrls.includes(photo.src.large)) {
        log.ok(`Pexels 이미지 확보: "${query}" (page ${page}) -> ${photo.url}`);
        return photo.src.large;
      }
      log.warn(`Pexels 결과가 최근 사용 이미지와 중복됨(page ${page}), 다음 페이지 시도`);
    } catch (err) {
      log.err(`Pexels 이미지 검색 실패: ${err.response?.data?.error || err.message}`);
      return null;
    }
  }
  log.warn(`Pexels에서 "${query}"의 새 이미지를 찾지 못해 마지막 결과를 사용합니다.`);
  return null;
};

module.exports = { fetchTopicImage, TOPIC_QUERIES };
