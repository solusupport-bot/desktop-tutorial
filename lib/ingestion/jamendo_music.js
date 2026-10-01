const axios = require('axios');
const log = require('../logger');

const JAMENDO_SEARCH_URL = 'https://api.jamendo.com/v3.0/tracks/';

/**
 * 2026-08-29엔 이 프로젝트에서 Jamendo devportal 가입이 막혀 Openverse로 대체했었지만
 * (openverse_music.js 참고), 부경텔레콤 릴스 프로젝트에서 2026-09-26에 Jamendo 계정이
 * 열려 Client ID를 발급받았다 — 같은 Client ID를 이 프로젝트(.env의 JAMENDO_CLIENT_ID)
 * 에도 그대로 재사용한다(2026-10-01 사용자 요청: "음악은 부경텔레콤에서 사용하던거로").
 * Jamendo는 보컬이 있는 완성곡 위주라 Openverse(CC 카탈로그 전체 통합검색, 필드레코딩/
 * 효과음도 섞임)보다 "노래 같은" 품질이 안정적이다 — openverse_music.js의 findMusic과
 * 같은 시그니처((mood, recentUrls) -> {url, name, artist, license, attribution})로 맞춰
 * attach_topic_music.js에서 자리만 바꿔 끼울 수 있게 한다.
 */
const SAFE_LICENSE_RE = /\/licenses\/([a-z-]+)\//;

// 2026-10-01: 참고한 pick_bgm.py(부경텔레콤)는 NC(비상업)만 걸렀는데, 이 파이프라인은
// 영상에 음원을 합성(2차적저작물)하므로 ND(변경금지) 트랙도 걸러야 한다 — 실측에서
// CC BY-ND 트랙이 통과돼버린 걸 발견해 추가함.
const isCommercialSafeLicense = (licenseUrl) => {
  if (!licenseUrl) return false;
  if (licenseUrl.includes('publicdomain')) return true;
  const m = licenseUrl.match(SAFE_LICENSE_RE);
  if (!m) return false;
  const terms = m[1].split('-');
  return !terms.includes('nc') && !terms.includes('nd');
};

const findMusic = async (mood, recentUrls = []) => {
  const clientId = process.env.JAMENDO_CLIENT_ID;
  if (!clientId) return null;

  let tracks;
  try {
    const res = await axios.get(JAMENDO_SEARCH_URL, {
      params: {
        client_id: clientId,
        format: 'json',
        limit: 20,
        order: 'popularity_total',
        audioformat: 'mp32',
        fuzzytags: mood
      },
      timeout: 15000
    });
    tracks = res.data?.results || [];
  } catch (err) {
    log.err(`Jamendo 음원 검색 실패: ${err.response?.data?.headers?.error_message || err.message}`);
    return null;
  }

  const safeTracks = tracks.filter((t) => t.audiodownload
    && t.audiodownload_allowed
    && isCommercialSafeLicense(t.license_ccurl));
  if (!safeTracks.length) {
    log.warn(`"${mood}"로 상업적으로 안전한 Jamendo 음원을 찾지 못했습니다.`);
    return null;
  }

  const pick = safeTracks.find((t) => !recentUrls.includes(t.audiodownload)) || safeTracks[0];
  const licenseMatch = pick.license_ccurl.match(SAFE_LICENSE_RE);
  const licenseLabel = licenseMatch ? `CC ${licenseMatch[1].toUpperCase()}` : 'CC';
  const attribution = `🎵 Track: ${pick.artist_name || 'Unknown'} - ${pick.name || 'Untitled'}\nMusic provided by Jamendo (${licenseLabel}).`;

  log.ok(`Jamendo 음원 확보(${licenseLabel}): "${pick.name}" by ${pick.artist_name || 'Unknown'} -> ${pick.audiodownload}`);
  return { url: pick.audiodownload, name: pick.name, artist: pick.artist_name || 'Unknown', license: licenseLabel, attribution };
};

module.exports = { findMusic };
