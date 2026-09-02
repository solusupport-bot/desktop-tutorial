// 2026-09-02 사용자가 실제로 Instagram Reels에서 쓸 수 있는 사운드 9곡을 직접
// 다운로드해서 전달함("인스타에서 사용가능한 음원들 있있든 그거 사용하라니까" —
// Meta Sound Collection은 API로 자동 첨부가 불가능하다는 걸 이미 확인했던 문제의
// 해결책으로, 사용자가 직접 곡을 받아와 파일로 넘겨줌). openverse_music.js의 무드
// 검색 기반 방식과 달리, 이건 고정된 9곡 목록을 순환(최근 안 쓴 곡 우선)하며 쓴다 —
// 주제별 무드 매칭이 필요 없고, Openverse처럼 검색 결과가 0건이라 폴백해야 할 상황도
// 없다(9곡 전부 로컬 확보된 파일이라 findMusic이 항상 성공한다).
//
// 라이선스 관련 주의(투명하게 남겨둠): 이 곡들은 Instagram/Meta의 Reels 사운드에서
// 받은 것으로, Openverse의 CC 라이선스 음원과는 성격이 다르다. Meta의 사운드
// 라이브러리는 보통 "앱 안에서 직접 그 사운드를 선택해 만든 콘텐츠"에 쓰라는
// 라이선스이고, 이번처럼 서드파티 자동화로 영상 파일에 미리 합성해 Graph API로
// 업로드하는 방식까지 명시적으로 허용하는지는 확인되지 않았다 — 사용자가 이미
// 리스크를 알고 진행하기로 한 결정이며, 계정 정지 등 리스크는 계정 소유자의 판단.
const MUSIC_DIR = 'https://raw.githubusercontent.com/solusupport-bot/desktop-tutorial/main/assets/music';

const TRACKS = [
  { name: 'Melt', url: `${MUSIC_DIR}/melt.m4a` },
  { name: 'Do You', url: `${MUSIC_DIR}/do-you.m4a` },
  { name: 'Good Thing', url: `${MUSIC_DIR}/good-thing.m4a` },
  { name: 'Good Thing (Instrumental)', url: `${MUSIC_DIR}/good-thing-instrumental.m4a` },
  { name: 'High With Me (Instrumental)', url: `${MUSIC_DIR}/high-with-me-instrumental.m4a` },
  { name: 'My Vibe', url: `${MUSIC_DIR}/my-vibe.m4a` },
  { name: 'Till the Night (Instrumental)', url: `${MUSIC_DIR}/till-the-night-instrumental.m4a` },
  { name: 'Slow It Down (Instrumental)', url: `${MUSIC_DIR}/slow-it-down-instrumental.m4a` },
  { name: 'Merry and Bright (Photo Dump)', url: `${MUSIC_DIR}/merry-and-bright-photo-dump.m4a` }
];

/**
 * recentUrls(오래된 순 -> 최신 순으로 쌓이는 배열, topic_rotation.js 참고)에서
 * 각 트랙이 마지막으로 쓰인 위치를 찾아, 가장 오래전에 쓰였거나(혹은 아예 안 쓰인,
 * 즉 lastIndexOf가 -1인) 트랙을 고른다 — 곡 풀이 9개뿐이라 "최근엔 안 쓴 곡"
 * 제외 방식(Openverse용)보다 이 방식이 9곡을 고르게 순환시키는 데 더 적합하다.
 */
const pickLeastRecentlyUsed = (recentUrls = []) => {
  let best = TRACKS[0];
  let bestIdx = recentUrls.lastIndexOf(best.url);
  for (const track of TRACKS.slice(1)) {
    const idx = recentUrls.lastIndexOf(track.url);
    if (idx < bestIdx) {
      best = track;
      bestIdx = idx;
    }
  }
  return best;
};

/** openverse_music.js의 findMusic과 동일한 시그니처(mood는 이 고정 목록에서는 쓰이지 않음). */
const findMusic = async (_mood, recentUrls = []) => {
  const pick = pickLeastRecentlyUsed(recentUrls);
  // attribution: null — CC 라이선스 곡이 아니라 표기 의무가 있는 게 아니므로
  // daily-auto-post.js가 캡션에 자동으로 곡명을 남기지 않는다(기존 Openverse
  // 경로는 attribution이 항상 채워지므로 그 라인에서 캡션에 표기됨).
  return { url: pick.url, name: pick.name, artist: null, license: null, attribution: null };
};

module.exports = { findMusic, TRACKS };
