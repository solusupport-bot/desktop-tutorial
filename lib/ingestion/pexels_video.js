const axios = require('axios');
const log = require('../logger');

const PEXELS_VIDEO_SEARCH_URL = 'https://api.pexels.com/videos/search';

/**
 * Pexels에서 실제 한국 관련 영상을 검색해 URL을 반환합니다.
 * 한국관광공사 오디오 가이드 API의 영상 데이터가 아직 연결 전이라(키 문제로 확인 중),
 * 지금은 임시로 Pexels 영상을 폴백 소스로 사용합니다 — 관광 API가 뚫리면 그쪽을 우선 사용해야 합니다.
 *
 * Pexels 영상에는 사진과 달리 alt 설명이 없어서 findKoreaPhoto처럼 결과 자체로
 * 한국임을 확인할 수는 없다 — 검색어에 "south korea"를 강제로 붙이는 것으로만 신호를 준다.
 * video_files 중 세로형(9:16에 가까운) mp4를 우선 고르고, 없으면 가로형 중 가장 화질 좋은 것을 쓴다.
 */
const findKoreaVideo = async (apiKey, rawQuery) => {
  const query = `${rawQuery} south korea`;
  try {
    const res = await axios.get(PEXELS_VIDEO_SEARCH_URL, {
      headers: { Authorization: apiKey },
      params: { query, per_page: 5, orientation: 'portrait' },
      timeout: 15000
    });
    const videos = res.data?.videos || [];
    if (!videos.length) {
      log.warn(`"${query}"로 영상을 찾지 못했습니다.`);
      return null;
    }
    const video = videos[0];
    const files = (video.video_files || []).filter((f) => f.file_type === 'video/mp4');
    const best = files.sort((a, b) => (b.width || 0) - (a.width || 0))[0];
    if (!best) return null;
    log.ok(`Pexels 영상 확보: "${query}" -> ${video.url} (${best.width}x${best.height})`);
    return best.link;
  } catch (err) {
    log.err(`Pexels 영상 검색 실패: ${err.response?.data?.error || err.message}`);
    return null;
  }
};

module.exports = { findKoreaVideo };
