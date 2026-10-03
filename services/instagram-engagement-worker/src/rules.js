const BLOG_BASE = 'https://landinkorea.com';

const TOPICS = [
  {
    id: 'esim',
    keywords: ['esim', 'e-sim', 'sim card', '유심', '이심', '데이터'],
    slug: 'korea-esim-comparison',
    ko: '한국 여행용 eSIM은 출국 전에 구매하고 도착 후 QR 코드로 활성화할 수 있어요. 휴대폰의 eSIM 지원 여부를 먼저 확인해 주세요.',
    en: 'A Korea travel eSIM can be bought before departure and activated by QR code after arrival. Check that your phone supports eSIM first.'
  },
  {
    id: 'tmoney',
    keywords: ['t-money', 'tmoney', '티머니', '교통카드', 'transit card'],
    slug: 'tmoney-first-timer-mistake',
    ko: 'T-money는 편의점이나 지하철역에서 구입해 지하철·버스·일부 택시에 사용할 수 있어요. 충전에는 현금이 필요한 곳이 많습니다.',
    en: 'You can buy T-money at convenience stores or subway stations and use it on subways, buses, and many taxis. Many top-up machines still require cash.'
  },
  {
    id: 'airport',
    keywords: ['incheon', 'gimpo', 'arex', '인천공항', '김포공항', '공항철도', 'airport transfer'],
    slug: 'incheon-airport-transfer-comparison',
    ko: '짐이 적다면 AREX가 예측하기 쉽고, 짐이 많다면 숙소 근처에 정차하는 공항버스가 편해요. 늦은 도착이라면 막차 시간을 먼저 확인해 주세요.',
    en: 'AREX is predictable with light luggage, while an airport bus can be easier with heavy bags. For late arrivals, check the last train time before choosing.'
  },
  {
    id: 'navigation',
    keywords: ['naver map', 'kakao map', 'google map', '네이버맵', '카카오맵', '구글맵', '길찾기'],
    slug: 'korea-navigation-apps',
    ko: '한국에서는 도보·대중교통 길찾기에 네이버맵이나 카카오맵이 더 정확한 편이에요. 목적지를 한글 주소로 함께 저장해 두면 편합니다.',
    en: 'Naver Map or KakaoMap is usually more reliable for walking and transit directions in Korea. Save the destination in Korean as well.'
  },
  {
    id: 'taxi',
    keywords: ['kakao t', 'kakaot', 'taxi', '카카오t', '카카오택시', '택시'],
    slug: 'korea-taxi-guide',
    ko: '카카오T에 목적지를 미리 입력하면 기사님께 주소를 다시 설명할 필요가 적어요. 공항에서는 공식 승차장을 이용해 주세요.',
    en: 'Kakao T lets you enter the destination before pickup, which reduces address confusion. At airports, use the official taxi rank.'
  },
  {
    id: 'luggage',
    keywords: ['luggage', 'locker', 'storage', '캐리어', '짐보관', '보관함'],
    slug: 'korea-luggage-storage',
    ko: '주요 역의 보관함은 주말과 연휴에 빨리 찰 수 있어요. 숙소 보관 서비스와 민간 짐 보관소를 예비 선택지로 확인해 두세요.',
    en: 'Station lockers can fill quickly on weekends and holidays. Keep hotel storage or a staffed luggage service as a backup.'
  },
  {
    id: 'chuseok',
    keywords: ['chuseok', '추석', 'ktx', '기차표', 'train ticket'],
    slug: 'korea-chuseok-travel-guide',
    ko: '추석 연휴에는 장거리 열차와 버스가 빠르게 매진되고 식당 운영시간도 달라질 수 있어요. 교통편과 방문 장소의 공식 공지를 각각 확인해 주세요.',
    en: 'During Chuseok, intercity trains and buses sell out quickly and business hours may change. Check transport and venue notices separately.'
  }
];

const GUIDE_WORDS = ['guide', 'link', 'send', 'dm', '가이드', '링크', '보내줘', '정보'];

export function detectLanguage(text = '') {
  return /[가-힣]/.test(text) ? 'ko' : 'en';
}

export function matchTopic(text = '') {
  const normalized = text.toLocaleLowerCase();
  return TOPICS.find((topic) => topic.keywords.some((keyword) => normalized.includes(keyword))) || null;
}

export function wantsGuide(text = '') {
  const normalized = text.toLocaleLowerCase();
  return GUIDE_WORDS.some((keyword) => normalized.includes(keyword));
}

export function buildResponse(text = '') {
  const topic = matchTopic(text);
  if (!topic) return null;

  const language = detectLanguage(text);
  const guideRequested = wantsGuide(text);
  const profileCta = language === 'ko'
    ? '프로필의 Land in Korea에서 관련 가이드를 확인해 주세요.'
    : 'You can find the related guide through the Land in Korea profile.';
  const publicText = `${topic[language]} ${profileCta}`;

  if (!guideRequested) {
    return { action: 'public_reply', topic: topic.id, publicText, privateText: null };
  }

  const url = `${BLOG_BASE}/posts/${topic.slug}.html?utm_source=instagram&utm_medium=comment_dm&utm_campaign=${topic.id}`;
  const privateText = language === 'ko'
    ? `${topic[language]} 요청하신 가이드입니다: ${url}`
    : `${topic[language]} Here is the guide you requested: ${url}`;
  const acknowledgement = language === 'ko'
    ? '요청하신 가이드를 DM으로 보내드렸어요.'
    : 'I sent the requested guide by DM.';

  return {
    action: 'private_reply',
    topic: topic.id,
    publicText: acknowledgement,
    privateText
  };
}

export const __test = { BLOG_BASE, GUIDE_WORDS, TOPICS };
