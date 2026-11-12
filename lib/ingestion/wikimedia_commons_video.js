const axios = require('axios');
const log = require('../logger');
const { isUsed } = require('./media_guard');
const { matchesTopic, OTHER_COUNTRY, KOREA_SIGNAL, topicKeywords } = require('./topic_match');

const COMMONS_API_URL = 'https://commons.wikimedia.org/w/api.php';
// Wikimedia API 에티켓: 익명 호출도 User-Agent에 연락 가능한 프로젝트 식별자를 요구한다.
const USER_AGENT = 'LandInKoreaBot/1.0 (https://landinkorea.com)';

// 2026-11-07 Coverr와 동일한 최소 해상도 기준(720p 이상, 가로/세로 중 짧은 변 1080px).
const MIN_VIDEO_WIDTH = 1080;

// 2026-11-12 실측: Wikimedia Commons는 범용 스톡이 아니라 뉴스/시사/정부 아카이브
// 비중이 커서, "한국 확인 + 주제 키워드 일치"만으로는 정치인 선거 유세 영상
// ("Namdaemun Market"에서 "Lee Nak-yon, leader of the Democratic Party... visited
// the Namdaemun market... meeting with officials" 영상이 그대로 통과함), DMZ 관련
// 전쟁/정상회담 아카이브 등이 새어 들어온다 — 여행 계정에 정치 콘텐츠가 섞이면
// 안 되므로, 제목에 아래 신호가 있으면 주제 일치 여부와 무관하게 무조건 제외한다.
const NEWS_POLITICAL_SIGNAL = /\b(president|minister|leader|election|campaign|politician|parliament|assembly|governor|mayor|protest|demonstration|riot|strike|coup|martial law|military|soldier|troops?|war|ambush|summit|chairman|coronavirus|covid|pandemic|outbreak|press conference|officials?)\b/i;

/**
 * Pexels/Pixabay/Coverr로도 후보가 없을 때 보강하는 4번째 무료 영상 소스(2026-11-12,
 * 사용자 요청 — 인스타그램 발행이 11/8부터 멈춘 원인인 영상 재고 고갈 대응). API 키가
 * 필요 없어(Wikimedia 공개 API) 별도 환경변수 체크 없이 항상 시도한다.
 *
 * Commons는 파일명(제목)만 신뢰할 수 있는 신호다(Pexels 슬러그·Pixabay 태그와 같은
 * 역할) — 한국/주제/미사용/정치뉴스 배제 필터를 전부 제목 하나로 판정한다.
 */
const findKoreaVideoCommons = async (rawQuery, recentUrls = []) => {
  const keywords = topicKeywords(rawQuery).slice(0, 4).join(' ');
  const query = `filetype:video ${keywords || rawQuery}`;

  try {
    const res = await axios.get(COMMONS_API_URL, {
      headers: { 'User-Agent': USER_AGENT },
      params: {
        action: 'query',
        generator: 'search',
        gsrnamespace: 6,
        gsrsearch: query,
        gsrlimit: 20,
        prop: 'videoinfo',
        viprop: 'url|size|mime',
        format: 'json'
      },
      timeout: 15000
    });
    const pages = Object.values(res.data?.query?.pages || {});
    if (!pages.length) {
      log.warn(`Commons "${query}"로 영상을 찾지 못했습니다.`);
      return null;
    }

    for (const page of pages) {
      const info = page.videoinfo?.[0];
      if (!info?.url || !info.height) continue;
      if ((info.width || 0) < MIN_VIDEO_WIDTH) continue;
      if (isUsed(recentUrls, info.url)) continue;
      const title = (page.title || '').replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '');
      if (NEWS_POLITICAL_SIGNAL.test(title)) continue;
      if (!KOREA_SIGNAL.test(title)) continue;
      if (OTHER_COUNTRY.test(title)) continue;
      if (!matchesTopic(rawQuery, title)) continue;
      log.ok(`Commons 한국 확인 영상 확보: "${query}" (title="${title}") -> ${info.url}`);
      return info.url;
    }

    log.warn(`Commons "${query}" 제목에서 한국 + 주제 일치(정치/시사 제외)를 확인 못해 건너뜁니다.`);
    return null;
  } catch (err) {
    log.err(`Commons 영상 검색 실패: ${err.response?.data || err.message}`);
    return null;
  }
};

module.exports = { findKoreaVideoCommons };
