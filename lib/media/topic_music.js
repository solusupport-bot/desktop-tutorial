// Openverse는 "eSIM"이나 "환급"처럼 실용 팁 자체를 음악 태그로 검색할 수 없으니,
// 실제로 뜻이 통하는 무드 검색어로 주제를 매핑한다(2026-08-31 사용자 요청: "내 주제에
// 맞는 음악"). 관광지 스포트라이트(category: 'attraction')는 그 장소의 느낌에 맞는
// 시네마틱/앰비언트 계열로, 나머지 실용 팁 주제는 경쾌한 여행 브이로그 계열로 나눈다.
const ATTRACTION_MOODS = {
  '경복궁': 'traditional korean ambient',
  '북촌한옥마을': 'traditional korean ambient',
  'N서울타워': 'cinematic city ambient',
  '명동': 'upbeat city pop',
  '해운대': 'chill beach ambient',
  '제주도': 'chill island ambient'
};

const TIP_MOOD = 'upbeat travel vlog';

/** 주제 하나에 어울리는 Openverse 검색어(무드)를 고른다. */
const moodForTopic = (item) => {
  if (item.category === 'attraction' && item.placeKeyword && ATTRACTION_MOODS[item.placeKeyword]) {
    return ATTRACTION_MOODS[item.placeKeyword];
  }
  if (item.category === 'attraction') return 'cinematic travel ambient';
  return TIP_MOOD;
};

module.exports = { moodForTopic };
