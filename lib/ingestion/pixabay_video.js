const axios = require('axios');
const log = require('../logger');
const { isUsed } = require('./media_guard');
const { matchesTopic, OTHER_COUNTRY, KOREA_SIGNAL, topicKeywords } = require('./topic_match');

const PIXABAY_VIDEO_SEARCH_URL = 'https://pixabay.com/api/videos/';

// 2026-10-02 사용자 규칙: "고화질 사진과 영상으로 만들어야된다" — pexels_video.js와
// 동일한 최소 해상도 기준(720p). Pixabay의 'medium' 등급은 보통 1280px 안팎이라
// 이 기준을 넘지만, 더 낮은 등급이 섞여 들어오는 걸 명시적으로 막는다.
// 2026-10-13: 가로 1280 기준이 릴스 표준 세로 풀HD(1080x1920)를 전부 떨어뜨리고 있었다 — 가로 1080으로 바로잡음. 이보다 낮추지 말 것.
const MIN_VIDEO_WIDTH = 1080;

/**
 * Pexels 영상 후보 풀이 부족할 때 보충하는 2차 무료 영상 소스입니다(2026-08-29, 사용자
 * 요청). 영상은 이미지보다 후보가 훨씬 적어서(주제당 검색어 1개) 이 보강이 특히
 * 효과적입니다. PIXABAY_API_KEY가 없으면 null을 반환해 조용히 건너뜁니다.
 */
// 2026-11-07 실측: rawQuery를 그대로 붙이면 제목이 긴 주제(콜론·부제 포함)에서
// Pixabay의 "q may not exceed 100 characters" 400 에러로 검색 자체가 죽었다
// (Bus travel inside Korean cities... 주제에서 실제로 재현). 주제 키워드만 추려
// 짧게 보내면 길이 문제도 없고, 긴 문장이 관련성 순위를 흐리는 것도 줄어든다.
// matchesTopic()의 최종 판정은 여전히 원문 rawQuery 전체로 하므로 느슨해지지 않는다.
const findKoreaVideoPixabay = async (apiKey, rawQuery, recentUrls = []) => {
  if (!apiKey) return null;
  const keywords = topicKeywords(rawQuery).slice(0, 4).join(' ');
  const query = `south korea ${keywords || rawQuery}`.slice(0, 100);

  try {
    const res = await axios.get(PIXABAY_VIDEO_SEARCH_URL, {
      params: { key: apiKey, q: query, safesearch: 'true', per_page: 50 },
      timeout: 15000
    });
    const hits = res.data?.hits || [];
    if (!hits.length) {
      log.warn(`Pixabay "${query}"로 영상을 찾지 못했습니다.`);
      return null;
    }

    const pickBestFile = (hit) => {
      const candidate = [hit.videos?.large, hit.videos?.medium]
        .find((v) => v && v.url && (v.width || 0) >= MIN_VIDEO_WIDTH);
      return candidate ? candidate.url : null;
    };

    for (const hit of hits) {
      const url = pickBestFile(hit);
      if (!url) continue;
      if (isUsed(recentUrls, url)) continue;
      if (!KOREA_SIGNAL.test(hit.tags || '')) continue;
      if (OTHER_COUNTRY.test(hit.tags || '')) continue;
      if (!matchesTopic(rawQuery, hit.tags)) continue;
      log.ok(`Pixabay 한국 확인 영상 확보: "${query}" (tags="${hit.tags}") -> ${hit.pageURL}`);
      return url;
    }

    log.warn(`Pixabay "${query}" 태그에서 한국 + 주제 일치를 확인 못해 건너뜁니다.`);
    return null;
  } catch (err) {
    log.err(`Pixabay 영상 검색 실패: ${err.response?.data || err.message}`);
    return null;
  }
};

module.exports = { findKoreaVideoPixabay };
