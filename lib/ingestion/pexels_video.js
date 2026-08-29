const axios = require('axios');
const log = require('../logger');

const PEXELS_VIDEO_SEARCH_URL = 'https://api.pexels.com/videos/search';

// pexels_image.js와 동일한 신호 — 영상엔 alt 설명이 없어서 대신 Pexels가 자동
// 생성하는 페이지 슬러그(video.url)에 이 단어가 있는지로 한국 여부를 추정합니다.
const KOREA_SIGNAL = /korea|korean|seoul|incheon|busan|hanok|k-pop/i;

/**
 * Pexels에서 실제 한국 관련 영상을 검색해 URL을 반환합니다.
 * 한국관광공사 API 4종은 연결이 확인됐지만 실제 "영상 파일"을 제공하는 서비스는
 * 없다(Odii 오디오가이드도 이미지+오디오+스크립트이지 영상이 아님) — 그래서 영상
 * 시각 자료는 계속 Pexels를 폴백으로 쓰고, 대신 캡션 본문 쪽을 공공데이터 실측치로
 * 채운다(예: lib/ingestion/tour_crowd.js).
 *
 * Pexels 영상에는 사진과 달리 alt 설명이 없어서 findKoreaPhoto처럼 결과 자체로
 * 한국임을 확인할 수는 없다 — 검색어에 "south korea"를 강제로 붙이는 것으로만 신호를 준다.
 * video_files 중 세로형(9:16에 가까운) mp4를 우선 고르고, 없으면 가로형 중 가장 화질 좋은 것을 쓴다.
 *
 * recentUrls에 최근 사용한 영상 URL 목록을 넘기면(중복 방지 표준 규칙 — 사진과 동일),
 * 그 목록에 없는 영상이 나올 때까지 검색 결과를 순서대로 훑는다.
 *
 * 2026-08-29: "convenience store hacks" 영상이 한국이 아닌 다른 나라 영상으로 나온 걸
 * 사용자가 직접 발견 — 검색어 끝에 "south korea"를 덧붙이기만 해서는 관련성 순위에서
 * 뒤로 밀려 신호가 약했다. (1) "south korea"를 검색어 맨 앞으로 옮기고, (2) 사진과
 * 동일한 이중 안전장치로, 영상엔 alt가 없는 대신 Pexels 자동 생성 슬러그(video.url)에
 * KOREA_SIGNAL이 있는 것을 1차로 우선 채택하고, 없으면 관련성만으로 재시도한다.
 */
const findKoreaVideo = async (apiKey, rawQuery, recentUrls = []) => {
  const query = `south korea ${rawQuery}`;
  try {
    const res = await axios.get(PEXELS_VIDEO_SEARCH_URL, {
      headers: { Authorization: apiKey },
      params: { query, per_page: 15, orientation: 'portrait' },
      timeout: 15000
    });
    const videos = res.data?.videos || [];
    if (!videos.length) {
      log.warn(`"${query}"로 영상을 찾지 못했습니다.`);
      return null;
    }

    const pickBestFile = (video) => {
      const files = (video.video_files || []).filter((f) => f.file_type === 'video/mp4');
      return files.sort((a, b) => (b.width || 0) - (a.width || 0))[0];
    };

    // 1차: 슬러그(video.url)에 한국 신호가 명확히 있는 것만 채택 (가장 안전)
    for (const video of videos) {
      const best = pickBestFile(video);
      if (!best) continue;
      if (recentUrls.includes(best.link)) continue;
      if (!KOREA_SIGNAL.test(video.url || '')) continue;
      log.ok(`Pexels 한국 확인 영상 확보: "${query}" -> ${video.url} (${best.width}x${best.height})`);
      return best.link;
    }

    // 2차: 슬러그에 신호가 없어도 "south korea"를 앞세운 검색이니 관련성만으로 재시도
    log.warn(`"${query}" 슬러그에서 한국 신호를 확인 못함 — 검색 관련성만으로 재시도`);
    for (const video of videos) {
      const best = pickBestFile(video);
      if (!best) continue;
      if (recentUrls.includes(best.link)) continue;
      log.warn(`Pexels 영상 확보(한국 미확인, 검색어 관련성만): "${query}" -> ${video.url} (${best.width}x${best.height})`);
      return best.link;
    }

    log.warn(`"${query}" 검색 결과가 전부 최근 사용한 영상과 중복됩니다.`);
    return null;
  } catch (err) {
    log.err(`Pexels 영상 검색 실패: ${err.response?.data?.error || err.message}`);
    return null;
  }
};

module.exports = { findKoreaVideo };
