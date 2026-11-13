const axios = require('axios');
const log = require('../logger');
const { isUsed } = require('./media_guard');
const { matchesTopic, OTHER_COUNTRY, KOREA_SIGNAL, topicKeywords } = require('./topic_match');

const VIMEO_SEARCH_URL = 'https://api.vimeo.com/videos';

// coverr_video.js/pixabay_video.js와 동일한 최소 해상도 기준(720p 이상, 가로 1080px).
const MIN_VIDEO_WIDTH = 1080;

/**
 * 2026-11-13 사용자 요청 — Pexels/Pixabay/Coverr/Commons 4개로도 인스타그램 영상
 * 재고가 자주 바닥나서(검토 결과 Internet Archive/Videvo는 둘 다 못 씀 — IA는 뉴스/
 * 정치 아카이브 위주로 저자대 위험, Videvo는 공개 API 자체가 죽어있음) 5번째 무료
 * 소스로 Vimeo를 추가한다. VIMEO_ACCESS_TOKEN 없으면 조용히 건너뛴다(Coverr와 동일 패턴).
 *
 * 주의: Vimeo는 스톡 영상 전용 사이트가 아니라 일반 영상 플랫폼이라, 검색 결과 중
 * 업로더가 다운로드를 막아둔 영상은 files 배열이 비어 있을 수 있다(Pexels/Pixabay처럼
 * "전부 스톡이라 항상 다운로드 가능"이 보장되지 않음) — files가 없으면 그냥 다음
 * 후보로 넘어간다. filter: 'CC'로 크리에이티브 커먼즈 라이선스만 검색해 저작권
 * 리스크를 줄인다.
 */
const findKoreaVideoVimeo = async (accessToken, rawQuery, recentUrls = []) => {
  if (!accessToken) return null;
  const keywords = topicKeywords(rawQuery).slice(0, 4).join(' ');
  const query = `south korea ${keywords || rawQuery}`;

  try {
    const res = await axios.get(VIMEO_SEARCH_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.vimeo.*+json;version=3.4'
      },
      params: { query, filter: 'CC', sort: 'relevant', per_page: 25 },
      timeout: 15000
    });
    const hits = res.data?.data || [];
    if (!hits.length) {
      log.warn(`Vimeo "${query}"로 영상을 찾지 못했습니다.`);
      return null;
    }

    for (const hit of hits) {
      const files = (hit.files || []).filter((f) => f.type === 'video/mp4');
      const best = files.sort((a, b) => (b.width || 0) - (a.width || 0))[0];
      if (!best || (best.width || 0) < MIN_VIDEO_WIDTH) continue;
      if (isUsed(recentUrls, best.link)) continue;
      const signal = `${hit.name || ''} ${hit.description || ''} ${(hit.tags || []).map((t) => t.name).join(' ')}`;
      if (!KOREA_SIGNAL.test(signal)) continue;
      if (OTHER_COUNTRY.test(signal)) continue;
      if (!matchesTopic(rawQuery, signal)) continue;
      log.ok(`Vimeo 한국 확인 영상 확보: "${query}" (name="${hit.name}") -> ${best.link}`);
      return best.link;
    }

    log.warn(`Vimeo "${query}" 결과에서 한국 + 주제 일치(+다운로드 가능)를 확인 못해 건너뜁니다.`);
    return null;
  } catch (err) {
    log.err(`Vimeo 영상 검색 실패: ${err.response?.data?.error || err.message}`);
    return null;
  }
};

module.exports = { findKoreaVideoVimeo };
