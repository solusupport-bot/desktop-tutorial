// Openverse는 "eSIM"이나 "환급"처럼 실용 팁 자체를 음악 태그로 검색할 수 없으니,
// 실제로 뜻이 통하는 무드 검색어로 주제를 매핑한다(2026-08-31 사용자 요청: "내 주제에
// 맞는 음악"). 관광지 스포트라이트(category: 'attraction')는 그 장소의 느낌에 맞는
// 시네마틱/앰비언트 계열로, 나머지 실용 팁 주제는 경쾌한 여행 브이로그 계열로 나눈다.
//
// 실측 확인(2026-09-01, Gyeongbokgung Palace 테스트 발행): "traditional korean
// ambient"처럼 3~4단어 조합은 Openverse에서 0건이 나왔다 — CC 음원 카탈로그(Free
// Music Archive/Jamendo 등)는 태그가 "ambient", "cinematic"처럼 짧은 범용 단어 위주라,
// 너무 구체적인 조합은 실제로 매칭될 확률이 낮다. 각 주제에 (1순위: 조금 더 구체적인
// 무드, 2순위: 훨씬 범용적인 폴백) 두 단계 검색어를 두고, 첫 검색이 0건이면 폴백으로
// 넘어간다(daily-auto-post.js/publish-curated-topic.js의 attachTopicMusic이 순서대로 시도).
const ATTRACTION_MOODS = {
  '경복궁': ['traditional ambient', 'ambient'],
  '북촌한옥마을': ['traditional ambient', 'ambient'],
  'N서울타워': ['cinematic ambient', 'cinematic'],
  '명동': ['upbeat pop', 'upbeat'],
  '해운대': ['chill beach', 'chill'],
  '제주도': ['chill acoustic', 'chill']
};

const ATTRACTION_FALLBACK = ['cinematic', 'ambient'];
const TIP_MOOD = ['upbeat travel', 'upbeat'];

// 최후 폴백: 위 무드가 전부 0건이어도(카탈로그 상황에 따라 여전히 있을 수 있음)
// 완전히 빈 손으로 돌아가지 않도록, 아주 범용적인 단어로 한 번 더 시도한다.
// 인스타 영상에 음악이 계속 안 붙는 문제가 반복 지적됐으므로(2026-09-01),
// 특정 무드를 못 찾았다고 음악 없이 발행하는 상황 자체를 최대한 줄인다.
const UNIVERSAL_FALLBACK = ['music', 'instrumental'];

/** 주제 하나에 어울리는 Openverse 검색어 후보 목록(우선순위 순)을 반환한다. */
const moodsForTopic = (item) => {
  if (item.category === 'attraction' && item.placeKeyword && ATTRACTION_MOODS[item.placeKeyword]) {
    return [...ATTRACTION_MOODS[item.placeKeyword], ...UNIVERSAL_FALLBACK];
  }
  if (item.category === 'attraction') return [...ATTRACTION_FALLBACK, ...UNIVERSAL_FALLBACK];
  return [...TIP_MOOD, ...UNIVERSAL_FALLBACK];
};

/** moodsForTopic의 후보를 순서대로 시도해 첫 매칭을 반환한다(다 실패하면 null). */
const findMusicForTopic = async (findMusic, item, recentUrls) => {
  for (const mood of moodsForTopic(item)) {
    const music = await findMusic(mood, recentUrls);
    if (music) return music;
  }
  return null;
};

module.exports = { moodsForTopic, findMusicForTopic };
