const axios = require('axios');
const log = require('../logger');
const { isUsed } = require('./media_guard');
const { matchesTopic, OTHER_COUNTRY, topicKeywords } = require('./topic_match');

const COVERR_VIDEOS_URL = 'https://api.coverr.co/videos';

const KOREA_SIGNAL = /korea|korean|seoul|incheon|busan|hanok|k-pop/i;

// 2026-10-02 사용자 규칙 "고화질 사진과 영상으로 만들어야된다" — pexels_video.js/
// pixabay_video.js와 동일한 최소 해상도 기준(720p 이상, 가로 1080px).
const MIN_VIDEO_WIDTH = 1080;

/**
 * Pexels/Pixabay로 못 채운 영상을 보강하는 3번째 무료 영상 소스(2026-11-07, 사용자
 * 요청 — "영상/이미지 찾을 수 있는 플랫폼을 늘려보자"). Coverr도 범용 스톡이라
 * 은행/약국처럼 진짜 희귀한 실내 소재는 여전히 못 채우지만(사전 조사로 확인됨),
 * 여행/교통 같은 일반 주제의 후보 풀은 넓혀준다. COVERR_API_KEY 없으면 조용히 건너뛴다.
 *
 * Coverr 영상엔 Pexels의 슬러그, Pixabay의 tags 같은 "국가 신호"가 따로 없어서 title+tags를
 * 합친 문자열로 KOREA_SIGNAL/OTHER_COUNTRY/matchesTopic을 전부 검사한다 — 다른 두 소스와
 * 동일한 "완화 금지" 원칙(미디어 3대 원칙: 중복금지/키워드일치/저화질금지).
 *
 * 인증은 Coverr 문서 권장 방식인 x-api-key 헤더를 쓴다. urls=true를 줘야 응답에 실제
 * mp4 주소(urls.mp4)가 포함된다(기본값은 생략됨).
 */
const findKoreaVideoCoverr = async (apiKey, rawQuery, recentUrls = []) => {
  if (!apiKey) return null;
  const keywords = topicKeywords(rawQuery).slice(0, 4).join(' ');
  const query = `south korea ${keywords || rawQuery}`;

  try {
    const res = await axios.get(COVERR_VIDEOS_URL, {
      headers: { 'x-api-key': apiKey },
      params: { query, page: 0, page_size: 20, urls: true },
      timeout: 15000
    });
    const hits = res.data?.hits || [];
    if (!hits.length) {
      log.warn(`Coverr "${query}"로 영상을 찾지 못했습니다.`);
      return null;
    }

    for (const hit of hits) {
      const url = hit.urls?.mp4;
      if (!url) continue;
      if ((hit.max_width || 0) < MIN_VIDEO_WIDTH) continue;
      if (isUsed(recentUrls, url)) continue;
      const signal = `${hit.title || ''} ${(hit.tags || []).join(' ')}`;
      if (!KOREA_SIGNAL.test(signal)) continue;
      if (OTHER_COUNTRY.test(signal)) continue;
      if (!matchesTopic(rawQuery, signal)) continue;
      log.ok(`Coverr 한국 확인 영상 확보: "${query}" (tags="${(hit.tags || []).join(',')}") -> ${url}`);
      return url;
    }

    log.warn(`Coverr "${query}" 태그에서 한국 + 주제 일치를 확인 못해 건너뜁니다.`);
    return null;
  } catch (err) {
    log.err(`Coverr 영상 검색 실패: ${err.response?.data || err.message}`);
    return null;
  }
};

module.exports = { findKoreaVideoCoverr };
