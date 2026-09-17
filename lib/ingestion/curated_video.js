const fs = require('fs');
const path = require('path');
const log = require('../logger');

// 2026-09-17 사용자 요청: 매번 Pexels를 실시간 검색하면 "한국인지"만 확인하고
// "주제랑 실제로 맞는지"는 확인 안 해서 엉뚱한 영상(지하철 주제에 성당 영상 등)이
// 붙을 위험이 있다 — 사람이 미리 보고 검증한 영상을 이 파일에 채워두고, 있으면
// 그걸 최우선으로 쓴다(라이브 검색보다 항상 우선). 없는 주제는 기존처럼 Pexels/
// Pixabay 실시간 검색으로 폴백한다(호출부 책임). GitHub Actions에서도 바로 읽을 수
// 있게 이 저장소 자신의 data/에 둔다(로컬 전용 폴더면 자동화가 못 씀).
const CURATED_VIDEOS_PATH = path.join(__dirname, '..', '..', 'data', 'curated_videos.json');

const loadCuratedVideos = () => {
  try {
    return JSON.parse(fs.readFileSync(CURATED_VIDEOS_PATH, 'utf8'));
  } catch (err) {
    return {};
  }
};

/** 검증된 영상 중 아직 안 쓴 것을 하나 반환한다. 없으면 null(호출부가 실시간 검색으로 폴백). */
const findCuratedVideo = (topic, recentUrls = []) => {
  const entries = loadCuratedVideos()[topic];
  if (!entries || !entries.length) return null;
  const pick = entries.find((e) => !recentUrls.includes(e.url));
  if (!pick) return null;
  log.ok(`검증된 영상 확보(큐레이션): "${topic}" -> ${pick.url} (${pick.note})`);
  return pick.url;
};

module.exports = { findCuratedVideo, loadCuratedVideos };
