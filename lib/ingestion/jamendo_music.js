const axios = require('axios');
const log = require('../logger');

const JAMENDO_SEARCH_URL = 'https://api.jamendo.com/v3.0/tracks/';

/**
 * license_ccurl 예: "https://creativecommons.org/licenses/by-nc-nd/4.0/" 에서
 * "by-nc-nd" 부분만 뽑아 토큰화합니다. 상업 계정(SNS 페이지) 게시물에 쓸 것이므로
 * nc(비영리 전용)는 무조건 제외하고, 영상 길이에 맞춰 자르고 페이드아웃을 넣는 것도
 * "변형"으로 보수적으로 취급해 nd(변경 금지)도 제외합니다. by / by-sa만 통과시킵니다.
 */
const isCommercialSafeLicense = (ccUrl) => {
  if (!ccUrl) return false;
  const match = ccUrl.match(/licenses\/([a-z0-9-]+)\//i);
  if (!match) return false;
  const tokens = match[1].split('-');
  return !tokens.includes('nc') && !tokens.includes('nd');
};

const searchTracks = async (clientId, tags) => {
  const params = {
    client_id: clientId,
    format: 'json',
    limit: 20,
    order: 'popularity_total',
    include: 'musicinfo',
    audioformat: 'mp32'
  };
  if (tags) params.tags = tags;
  const res = await axios.get(JAMENDO_SEARCH_URL, { params, timeout: 15000 });
  return res.data?.results || [];
};

/**
 * 실제 음원 차트(멜론/빌보드 등) 인기곡은 저작권 때문에 자동화 파이프라인에 못 씁니다
 * (Meta 저작권 매칭에 걸려 음소거/게시물 삭제/계정 정지 위험 — 2026-08-29 사용자에게 설명 완료).
 * 대신 Jamendo(CC 라이선스 독립 음원 카탈로그)에서 "그 안에서" 실제 인기 랭킹
 * (popularity_total) 순으로 정렬해 가져오고, 상업적 이용이 확실히 안전한 라이선스만
 * 통과시킵니다. mood 태그로 먼저 시도하고, 결과가 없으면 태그 없이 전체 인기 랭킹으로
 * 재시도합니다(항상 곡을 하나는 찾도록).
 */
const findPopularMusic = async (clientId, mood, recentUrls = []) => {
  if (!clientId) {
    log.warn('JAMENDO_CLIENT_ID가 없어 배경음악을 건너뜁니다.');
    return null;
  }
  try {
    let tracks = await searchTracks(clientId, mood);
    if (!tracks.length) tracks = await searchTracks(clientId, null);

    const safeTracks = tracks.filter((t) => t.audiodownload_allowed && isCommercialSafeLicense(t.license_ccurl));
    if (!safeTracks.length) {
      log.warn('상업적으로 안전한 라이선스의 Jamendo 음원을 찾지 못했습니다.');
      return null;
    }

    const pick = safeTracks.find((t) => !recentUrls.includes(t.audio)) || safeTracks[0];
    log.ok(`Jamendo 인기 음원 확보(카탈로그 내 인기 랭킹, 라이선스 ${pick.license_ccurl}): "${pick.name}" by ${pick.artist_name} -> ${pick.audio}`);
    return { url: pick.audio, name: pick.name, artist: pick.artist_name, license: pick.license_ccurl };
  } catch (err) {
    log.err(`Jamendo 음원 검색 실패: ${err.response?.data?.error || err.message}`);
    return null;
  }
};

module.exports = { findPopularMusic, isCommercialSafeLicense };
