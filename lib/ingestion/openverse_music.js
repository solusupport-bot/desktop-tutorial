const axios = require('axios');
const log = require('../logger');

const OPENVERSE_SEARCH_URL = 'https://api.openverse.org/v1/audio/';

/**
 * Jamendo는 API 키 발급(devportal 가입)이 필요한데 가입이 막혀 있어(2026-08-29 사용자 실측),
 * 대신 가입/키 없이(익명 요청 허용) 쓸 수 있는 Openverse(크리에이티브 커먼즈 재단이 운영하는
 * CC 라이선스 통합 검색 — Jamendo/Free Music Archive/Wikimedia Commons 등을 한 번에 검색)로
 * 대체합니다. license_type=commercial,modification 파라미터로 서버 단에서 이미
 * "상업적 이용 가능 + 변형(트림/페이드) 가능" 라이선스만 걸러주지만, 혹시 몰라 응답의
 * license 필드도 한 번 더 검증합니다(방어적 이중 체크).
 *
 * Jamendo와 달리 공식 "인기순" 정렬 파라미터가 확인되지 않아 관련도순 결과를 그대로
 * 씁니다 — 사용자에게 이미 설명: "실제 인기순위"는 아니고 합법 카탈로그 안에서 고른 곡.
 */
const SAFE_LICENSES = ['cc0', 'pdm', 'by', 'by-sa'];

const findMusic = async (mood, recentUrls = []) => {
  try {
    const res = await axios.get(OPENVERSE_SEARCH_URL, {
      params: {
        q: mood,
        category: 'music',
        license_type: 'commercial,modification',
        page_size: 20
      },
      timeout: 15000
    });
    const tracks = res.data?.results || [];
    if (!tracks.length) {
      log.warn(`"${mood}"로 Openverse 음원을 찾지 못했습니다.`);
      return null;
    }

    const safeTracks = tracks.filter((t) => t.url && SAFE_LICENSES.includes((t.license || '').toLowerCase()));
    if (!safeTracks.length) {
      log.warn('상업적으로 안전한 라이선스의 Openverse 음원을 찾지 못했습니다.');
      return null;
    }

    const pick = safeTracks.find((t) => !recentUrls.includes(t.url)) || safeTracks[0];
    const attribution = pick.attribution
      || `"${pick.title}" by ${pick.creator || 'Unknown'} (CC ${(pick.license || '').toUpperCase()}, via Openverse)`;

    log.ok(`Openverse 음원 확보(라이선스 ${pick.license}): "${pick.title}" by ${pick.creator || 'Unknown'} -> ${pick.url}`);
    return { url: pick.url, name: pick.title, artist: pick.creator || 'Unknown', license: pick.license, attribution };
  } catch (err) {
    log.err(`Openverse 음원 검색 실패: ${err.response?.data?.detail || err.message}`);
    return null;
  }
};

module.exports = { findMusic };
