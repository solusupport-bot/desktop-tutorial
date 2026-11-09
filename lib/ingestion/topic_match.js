// 2026-10-12 사용자 지적: "키워드에 맞지 않는 영상이 계속 올라온다" — 실시간 영상 검색은
// "한국인지"만 확인해서 택시 주제에 서울 도로 영상, 구글맵 주제에 교차로 영상, 10월 짐싸기
// 주제에 벚꽃 영상이 붙었다. 미디어 3대 원칙 2번(키워드 일치)을 영상에도 강제한다:
// 검색어의 주제 단어가 Pexels 슬러그/Pixabay 태그에 최소 1개는 있어야 채택한다.
// 이건 싼 1차 거름망이고, 최종 판정은 media_vision_check.js가 실제 화면을 보고 한다.
// 2026-11-06 실측(인스타 키워드 불일치): "mobile banking payment app phone korea" 같은
// 검색어에서 "phone" 한 단어만 슬러그에 있어도 통과돼, bank/counter/phone처럼 여러 주제에
// 걸쳐 흔히 쓰이는 단어 하나 때문에 전혀 다른 영상이 뽑혔다 — 아래 matchesTopic에서
// 단어가 2개 이상 있는 주제는 2개 이상 일치를 요구하도록 강화한다.
// 한국·장소·계절·색·수식어는 아무 영상에나 붙어 있어 주제 증거가 못 되므로 제외한다.
const GENERIC_WORDS = new Set([
  'south', 'korea', 'korean', 'seoul', 'busan', 'incheon', 'jeju', 'city', 'street', 'road',
  'the', 'and', 'for', 'with', 'from', 'into', 'on', 'in', 'of', 'at', 'a', 'an', 'to',
  'people', 'person', 'view', 'scene', 'urban', 'building', 'night', 'day',
  'spring', 'summer', 'autumn', 'fall', 'winter',
  'red', 'orange', 'yellow', 'green', 'blue', 'black', 'white', 'pink', 'colorful',
  'traditional', 'interior', 'tourist', 'traveler', 'holding', 'modern', 'old', 'new'
]);

// 단수형으로 맞춰 정확히 같은 단어끼리만 비교한다 — 앞부분 비교는 bus→business,
// map→maple, app→apartment 같은 오탐을 냈다(검토 에이전트 지적).
const singular = (w) => {
  if (w.length > 4 && /(ches|shes|sses|xes)$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
};

const tokens = (text) => String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map(singular);

const topicKeywords = (query) =>
  [...new Set(tokens(query))].filter((w) => w.length >= 3 && !GENERIC_WORDS.has(w));

/**
 * text(슬러그·태그)에 검색어의 주제 단어가 충분히 있으면 true.
 * 주제 단어가 2개 이상이면 그중 2개 이상이 있어야 통과 — 흔한 단어 하나만 겹쳐서
 * 통과하던 오매칭을 막는다. 주제 단어가 1개뿐이면(소재가 희귀한 주제) 그 1개로 통과.
 */
const matchesTopic = (query, text) => {
  const words = new Set(tokens(text));
  const keywords = topicKeywords(query);
  const matchCount = keywords.filter((kw) => words.has(kw)).length;
  return matchCount > 0 && matchCount >= Math.min(2, keywords.length);
};

// 실측: "korea"가 태그에 섞여 있어도 china/japan/india가 같이 붙은 세계지도 영상이 통과했다
// — 다른 나라가 함께 태그된 영상은 한국 영상으로 보지 않는다(인물/배경 무조건 한국 하드룰).
// north korea/pyongyang은 "korea"를 포함해 한국 신호 검사를 통과하므로 따로 막는다.
const OTHER_COUNTRY = /\b(north korea|pyongyang|china|chinese|japan|japanese|tokyo|osaka|kyoto|india|thailand|vietnam|taiwan|hong kong|singapore|philippines|usa|america)\b/i;

// 2026-11-09 실측(인스타그램 5일간 영상 전부 "미디어 없음" 반려): "korea|korean|seoul|
// incheon|busan|hanok|k-pop" 7개 단어뿐이던 한국 신호가 Pexels/Pixabay/Coverr 3개
// 영상 소스(pexels_video.js, pixabay_video.js, coverr_video.js)에 각각 복제돼 있었는데,
// 화성행궁/인사동/홍대처럼 실제로 영상이 있는 유명 지명도 자동 생성 슬러그에 저 7단어가
// 없으면 전부 탈락했다(실측: "hwaseong-fortress-water-gate" 슬러그가 검색 1위였는데도
// 통과 못 함). 키워드 일치 강도(2개 단어 요구)나 중복방지(isUsed)는 그대로 두고 —
// "이게 한국이다"를 인정하는 지명 목록만, 실제 TOPIC_QUERIES에서 쓰는 지명들로 넓힌다.
// 3개 소스가 각자 복제해 두던 걸 여기 하나로 모아 매칭 기준을 한 곳에서만 관리한다.
const KOREA_SIGNAL = /korea|korean|seoul|incheon|busan|hanok|k-pop|gyeongbokgung|changdeokgung|deoksugung|bukchon|namsan|myeongdong|haeundae|gamcheon|jeju|hallasan|insadong|hongdae|\bnami\b|gapyeong|suwon|hwaseong|haenggung|namdaemun|dongdaemun|\bdmz\b|panmunjom|jjimjilbang|bukhansan|gangnam|itaewon|jeonju|gyeongju|gwangjang|jongno|jinju|hanbok|hangul/i;

/** Pexels 페이지 URL에서 설명 슬러그만 뽑는다(https/www/pexels/video 같은 단어가 비교에 섞이지 않게). */
const pexelsSlug = (url) => String(url || '').replace(/^.*\/(video|photo)\//, '').replace(/-/g, ' ');

module.exports = { matchesTopic, topicKeywords, OTHER_COUNTRY, KOREA_SIGNAL, pexelsSlug };
