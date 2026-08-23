const axios = require('axios');
const log = require('../logger');

const PEXELS_SEARCH_URL = 'https://api.pexels.com/v1/search';

// 주제별 실제 사진 검색어. korea_travel.js의 SOURCES[].topic과 키를 맞춥니다.
//
// 중요: 각 배열의 i번째 검색어는 korea_travel.js의 해당 주제 content 배열
// i번째 "각도"와 반드시 내용이 맞아야 합니다 (배열 길이도 동일해야 함).
// topic_rotation.js가 같은 seed로 content 각도와 이 검색어를 동시에 고르기
// 때문에, 배열 길이가 다르면 seed%content.length와 seed%query.length가
// 어긋나서 본문과 무관한 이미지가 나올 수 있습니다 (실제로 발생했던 버그:
// "손 제스처/에티켓" 본문에 "한옥마을 풍경" 사진이 붙었던 사례).
// 새 주제를 추가하거나 각도를 늘릴 때는 이 1:1 대응을 반드시 유지하세요.
const TOPIC_QUERIES = {
  'eSIM & mobile data': [
    'traveler scanning qr code smartphone airport', // angle0: 온라인 구매 후 QR 활성화
    'airport sim card wifi rental counter' // angle1: 공항 실물 유심/포켓와이파이 카운터
  ],
  'T-money transit card': [
    'commuter tapping transit card subway gate', // angle0: 탭 인/아웃 교통 이용
    'convenience store cashier counter korea' // angle1: 편의점 결제/충전
  ],
  'Tax refund (Tax Free) shopping': [
    'airport tax refund kiosk counter', // angle0: 공항 환급 키오스크
    'seoul department store checkout register' // angle1: 매장 즉시환급 계산대
  ],
  'Travel advisories & safety notices': [
    'crowded night market street asia', // angle0: 소매치기 주의 붐비는 시장
    'rainy city street umbrella pedestrians' // angle1: 태풍/폭설 등 기상 변수
  ],
  'Airport transfer options': [
    'airport shuttle bus arrival', // angle0: AREX/리무진버스/택시
    'taxi pickup line airport curb' // angle1: 카카오T 라이드헤일링/심야 택시
  ],
  'First-timer etiquette & common mistakes': [
    'shoes entrance korean restaurant floor seating', // angle0: 팁 문화/신발 벗기/좌식
    'friends sharing meal table toast drinks' // angle1: 손짓/술 따르기/식사 매너
  ],
  'Currency & card payments': [
    'atm machine street city asia', // angle0: 카드 결제 사회/해외카드 ATM
    'currency exchange counter cash' // angle1: 환전소/원화 결제 선택
  ],
  'Emergency numbers & 24hr pharmacies': [
    'hospital emergency entrance building modern', // angle0: 112/119/국제진료소
    'pharmacy neon sign storefront night' // angle1: 심야 약국
  ],
  'Useful travel apps': [
    'tourist smartphone map street navigation', // angle0: 네이버맵/카카오맵/파파고
    'commuter phone subway platform' // angle1: 실시간 도착정보/환승 안내
  ],
  'Convenience store hacks': [
    'korean convenience store interior shelves', // angle0: 24시간 편의점 다기능
    'convenience store coffee counter morning' // angle1: 커피/토스트/상비약
  ],
  'Seasonal packing & weather tips': [
    'seoul cherry blossom spring street', // angle0: 계절별 날씨 특징
    'snow winter city street coat' // angle1: 실내외 온도차/레이어링
  ],
  'Luggage storage & forwarding services': [
    'train station luggage lockers', // angle0: 코인로커/짐 보관 카운터
    'traveler rolling suitcase city street' // angle1: 당일 수하물 배송 서비스
  ]
};

// 실제 원본 해상도가 이 값보다 낮으면(저화질 소스) 건너뛰고 다음 후보를 봅니다.
const MIN_ORIGINAL_WIDTH = 3000;

/**
 * 주제에 맞는 실제 고화질 사진 한 장을 Pexels에서 검색해 URL을 반환합니다.
 * PEXELS_API_KEY가 없거나 검색 결과가 없으면 null을 반환합니다(호출부에서 폴백 처리).
 *
 * - seed로 검색어 변형(TOPIC_QUERIES 배열 중 하나)을 골라, 같은 주제라도 매번
 *   다른 구도/피사체의 사진을 시도합니다.
 * - 가로(landscape) 사진만 사용합니다 — 피드에서 세로 사진보다 잘리지 않고
 *   임팩트 있게 노출됩니다.
 * - photo.width(원본 해상도)가 MIN_ORIGINAL_WIDTH 미만이면 저화질로 보고 건너뜁니다.
 * - src.large2x(최대 약 1880px)를 사용해 SNS 피드의 고DPI 화면에서도 선명하게 보이도록 합니다.
 * - recentUrls에 최근 사용한 이미지 URL 목록을 넘기면, 그 목록에 없는 사진이 나올 때까지
 *   검색 결과 페이지를 바꿔가며 재시도합니다.
 */
const fetchTopicImage = async (topic, recentUrls = [], seed = 0) => {
  const apiKey = process.env.PEXELS_API_KEY;
  const variants = TOPIC_QUERIES[topic];

  if (!apiKey || !variants) {
    log.warn(`PEXELS_API_KEY 또는 "${topic}" 검색어가 없어 이미지 검색을 건너뜁니다.`);
    return null;
  }

  const query = variants[seed % variants.length];

  for (let page = 1; page <= 5; page += 1) {
    try {
      const res = await axios.get(PEXELS_SEARCH_URL, {
        headers: { Authorization: apiKey },
        params: { query, per_page: 3, page, orientation: 'landscape' },
        timeout: 10000
      });
      const photos = res.data?.photos || [];
      if (!photos.length) {
        log.warn(`Pexels에서 "${query}" 검색 결과가 없습니다(page ${page}).`);
        return null;
      }

      for (const photo of photos) {
        if (photo.width < MIN_ORIGINAL_WIDTH) continue;
        if (recentUrls.includes(photo.src.large2x)) continue;
        log.ok(`Pexels 고화질 이미지 확보: "${query}" (page ${page}, ${photo.width}px) -> ${photo.url}`);
        return photo.src.large2x;
      }
      log.warn(`Pexels 결과가 저화질이거나 최근 사용 이미지와 중복됨(page ${page}), 다음 페이지 시도`);
    } catch (err) {
      log.err(`Pexels 이미지 검색 실패: ${err.response?.data?.error || err.message}`);
      return null;
    }
  }
  log.warn(`Pexels에서 "${query}"의 새 고화질 이미지를 찾지 못했습니다.`);
  return null;
};

module.exports = { fetchTopicImage, TOPIC_QUERIES };
