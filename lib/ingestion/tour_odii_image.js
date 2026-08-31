const axios = require('axios');
const log = require('../logger');
const { normalizeServiceKey } = require('./tour_service_key');

const ODII_URL = 'https://apis.data.go.kr/B551011/Odii/themeSearchList';

/**
 * 한국관광공사 Odii 오디오가이드 API에서 실제 관광지 사진을 찾는다. 이 API는
 * 특정 관광지(경복궁, 남산 등) DB라 attraction 카테고리 주제에서만 의미가 있다
 * (land-in-korea-blog/automation/fetch_images.py의 find_tourapi_image와 동일한
 * 로직 — 실제 공식 사진이 있으면 스톡 사진보다 우선한다. 2026-08-31 사용자 요청).
 * 매칭이 없으면(일반적인 결과) null을 반환해 호출부가 Pexels로 자연스럽게 넘어가게 한다.
 */
const findKoreaAttractionPhoto = async (keyword, recentUrls = []) => {
  const apiKey = normalizeServiceKey(process.env.TOUR_AUDIO_GUIDE_API_KEY);
  if (!apiKey || !keyword) return null;

  try {
    const res = await axios.get(ODII_URL, {
      params: {
        serviceKey: apiKey,
        MobileOS: 'ETC',
        MobileApp: 'LandInKorea',
        _type: 'json',
        numOfRows: 10,
        pageNo: 1,
        keyword,
        langCode: 'ko'
      },
      timeout: 15000
    });
    let items = res.data?.response?.body?.items?.item || [];
    if (!Array.isArray(items)) items = [items];
    const match = items.find((item) => item.imageUrl && !recentUrls.includes(item.imageUrl));
    if (match) {
      log.ok(`TourAPI 실제 이미지 확보("${keyword}", ${match.title || ''}): ${match.imageUrl}`);
      return match.imageUrl;
    }
    return null;
  } catch (err) {
    log.warn(`TourAPI Odii 검색 실패("${keyword}"): ${err.response?.data?.message || err.message}`);
    return null;
  }
};

module.exports = { findKoreaAttractionPhoto };
