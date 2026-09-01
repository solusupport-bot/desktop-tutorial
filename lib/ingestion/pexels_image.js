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
// 모든 검색어에 반드시 "korea/seoul/korean" 등 한국 신호가 명시적으로 들어가야 합니다.
// (실제로 이 신호가 빠진 검색어들 때문에 외국 느낌의 사진이 섞여 나온 적이 있었습니다.)
// 아래 검색어 자체에도 넣어두지만, fetchTopicImage에서 API 호출 시 " south korea"를
// 한 번 더 강제로 덧붙여 이중 안전장치를 둡니다.
const TOPIC_QUERIES = {
  // 관광지 스포트라이트 6개(2026-08-31 추가) — 한국관광공사 Odii 실사진이 우선이지만
  // (tour_odii_image.js), 실패/타임아웃 시 이 검색어가 없으면 이미지가 아예 0장이 되어
  // Threads/Facebook 이미지 우선 정책이 무너진다(2026-09-01 실측 — Odii 타임아웃 +
  // 이 맵에 항목이 없어 Gyeongbokgung Palace 테스트 발행이 이미지 없이 나감).
  'Gyeongbokgung Palace': [
    'gyeongbokgung palace seoul korea guard ceremony', // angle0: 수문장 교대식/한복 무료입장
    'gyeongbokgung palace seoul korea architecture courtyard' // angle1: 1395년 건립/국립민속박물관
  ],
  'Bukchon Hanok Village': [
    'bukchon hanok village seoul korea alley houses', // angle0: 실거주 주택가/조용히 관람
    'bukchon hanok village seoul korea traditional rooftops' // angle1: 경복궁-창덕궁 사이 도보 연결
  ],
  'N Seoul Tower (Namsan)': [
    'n seoul tower namsan korea skyline view', // angle0: 무료 전망대/유료 전망대 비교
    'namsan seoul korea hiking trail cable car' // angle1: 명동에서 도보 등산로
  ],
  'Myeongdong shopping district': [
    'myeongdong seoul korea shopping street cosmetics', // angle0: 화장품/패션 상점가
    'myeongdong seoul korea street food stalls evening' // angle1: 오후 늦게 열리는 길거리 음식
  ],
  'Busan Haeundae Beach & Gamcheon Culture Village': [
    'haeundae beach busan korea coastline', // angle0: 해운대 해변/여름 성수기
    'gamcheon culture village busan korea colorful houses' // angle1: 감천문화마을 계단/골목
  ],
  'Jeju Island': [
    'jeju island korea hallasan mountain landscape', // angle0: 기차 없음/한라산
    'jeju island korea black sand beach coastline' // angle1: 해안 날씨 변화/렌터카
  ],
  'eSIM & mobile data': [
    'traveler scanning qr code smartphone incheon airport', // angle0: 온라인 구매 후 QR 활성화
    'incheon airport sim card wifi rental counter' // angle1: 공항 실물 유심/포켓와이파이 카운터
  ],
  'T-money transit card': [
    'seoul subway commuter tapping transit card gate', // angle0: 탭 인/아웃 교통 이용
    'korean convenience store cashier counter' // angle1: 편의점 결제/충전
  ],
  'Tax refund (Tax Free) shopping': [
    'incheon airport tax refund kiosk counter', // angle0: 공항 환급 키오스크
    'seoul department store checkout register' // angle1: 매장 즉시환급 계산대
  ],
  'Travel advisories & safety notices': [
    'seoul night market crowded street', // angle0: 소매치기 주의 붐비는 시장
    'korea rainy city street umbrella pedestrians' // angle1: 태풍/폭설 등 기상 변수
  ],
  'Airport transfer options': [
    'incheon airport shuttle bus arrival', // angle0: AREX/리무진버스/택시
    'seoul taxi pickup line airport curb' // angle1: 카카오T 라이드헤일링/심야 택시
  ],
  'First-timer etiquette & common mistakes': [
    'korean restaurant floor seating shoes entrance', // angle0: 팁 문화/신발 벗기/좌식
    'korean friends sharing meal table toast drinks' // angle1: 손짓/술 따르기/식사 매너
  ],
  'Currency & card payments': [
    'seoul atm machine street', // angle0: 카드 결제 사회/해외카드 ATM
    'korea currency exchange counter cash' // angle1: 환전소/원화 결제 선택
  ],
  'Emergency numbers & 24hr pharmacies': [
    'korean hospital emergency entrance building', // angle0: 112/119/국제진료소
    'seoul pharmacy neon sign storefront night' // angle1: 심야 약국
  ],
  'Useful travel apps': [
    'tourist smartphone map seoul street navigation', // angle0: 네이버맵/카카오맵/파파고
    'seoul subway commuter phone platform' // angle1: 실시간 도착정보/환승 안내
  ],
  'Convenience store hacks': [
    'korean convenience store interior shelves', // angle0: 24시간 편의점 다기능
    'korean convenience store coffee counter morning' // angle1: 커피/토스트/상비약
  ],
  'Seasonal packing & weather tips': [
    'seoul cherry blossom spring street', // angle0: 계절별 날씨 특징
    'seoul snow winter city street coat' // angle1: 실내외 온도차/레이어링
  ],
  'Luggage storage & forwarding services': [
    'korea train station luggage lockers', // angle0: 코인로커/짐 보관 카운터
    'seoul traveler rolling suitcase city street' // angle1: 당일 수하물 배송 서비스
  ]
};

// 검색어에 한국 신호가 있어도 결과 자체는 다른 나라 사진일 수 있어, Pexels가 제공하는
// 사진 설명(alt)에 한국 관련 단어가 있는지 한 번 더 확인합니다.
const KOREA_SIGNAL = /korea|korean|seoul|incheon|busan|hanok|k-pop/i;

// 실제 원본 해상도가 이 값보다 낮으면(저화질 소스) 건너뛰고 다음 후보를 봅니다.
const MIN_ORIGINAL_WIDTH = 3000;

/**
 * 주제에 맞는 실제 고화질 "한국" 사진 한 장을 Pexels에서 검색해 URL을 반환합니다.
 * PEXELS_API_KEY가 없거나 한국임이 확인되는 결과가 없으면 null을 반환합니다
 * (호출부에서 폴백 처리 — 외국 느낌 사진을 억지로 쓰느니 이미지 없이 텍스트만 발행).
 *
 * - seed로 검색어 변형(TOPIC_QUERIES 배열 중 하나)을 골라, 같은 주제라도 매번
 *   다른 구도/피사체의 사진을 시도합니다.
 * - 검색어 자체에 이미 korea/seoul 등을 넣어두지만, API 호출 시 " south korea"를
 *   한 번 더 강제로 붙여 이중으로 한국 관련 결과를 유도합니다.
 * - Pexels가 제공하는 사진 설명(alt)에 KOREA_SIGNAL(korea/seoul/incheon 등)이
 *   있는 사진만 1차로 채택합니다 — 검색어에 korea를 넣어도 실제로는 다른 나라
 *   사진이 섞여 나올 수 있기 때문입니다. 여러 페이지를 다 뒤져도 못 찾으면
 *   이미지 없이 발행하도록 null을 반환합니다(외국 사진을 쓰지 않기 위함).
 * - 가로(landscape) 사진만 사용합니다 — 피드에서 세로 사진보다 잘리지 않고
 *   임팩트 있게 노출됩니다.
 * - photo.width(원본 해상도)가 MIN_ORIGINAL_WIDTH 미만이면 저화질로 보고 건너뜁니다.
 * - src.large2x(최대 약 1880px)를 사용해 SNS 피드의 고DPI 화면에서도 선명하게 보이도록 합니다.
 * - recentUrls에 최근 사용한 이미지 URL 목록을 넘기면, 그 목록에 없는 사진이 나올 때까지
 *   검색 결과 페이지를 바꿔가며 재시도합니다.
 */
// 한 번에 더 많이(6장 -> 15장) 받아와야 실제로 뒤져볼 수 있는 후보 풀이 커집니다 —
// 아래 findKoreaPhoto의 페이지 수 확대와 함께, 사진 반복 문제의 근본 원인(주제당
// 검색어 1~2개가 뒤질 수 있는 후보 자체가 30장뿐이라 금방 바닥남)을 해결합니다.
const PAGE_SIZE = 15;
const searchPexels = async (apiKey, query, page) => {
  const res = await axios.get(PEXELS_SEARCH_URL, {
    headers: { Authorization: apiKey },
    params: { query, per_page: PAGE_SIZE, page, orientation: 'landscape' },
    timeout: 10000
  });
  return res.data?.photos || [];
};

/**
 * 임의의 검색어로 "한국임이 확인되는" 고화질 사진을 찾습니다. fetchTopicImage와
 * patch-queue-image.js(수동 교체 스크립트)가 동일한 안전장치를 쓰도록 공용으로 뺐습니다.
 */
// 페이지 수(8) x PAGE_SIZE(15) = 최대 120장까지 뒤져봅니다 — 기존 30장으로는
// 주제 하나에 검색어가 1~2개뿐이라 진짜 후보 풀이 금방 바닥나서(2026-08-29 사용자가
// "자꾸 중복된 사진이 올라온다"고 반복 지적) MAX_RECENT_IMAGES를 아무리 늘려도
// 근본적으로 새 사진이 없었습니다. 검색당 뒤지는 후보 자체를 4배로 늘려 해결합니다.
const MAX_PAGES = 8;

// 2026-08-29: 영상 검색과 같은 이유로 "south korea"를 검색어 맨 앞으로 옮깁니다 —
// Pexels 관련도 순위에서 뒤에 붙은 단어보다 앞에 오는 단어의 신호가 더 강하게 반영됩니다
// (사용자 요청: "관광API=키워드만, 무료이미지=korea+키워드" 공식으로 통일).
const findKoreaPhoto = async (apiKey, rawQuery, recentUrls = []) => {
  const query = `south korea ${rawQuery}`;

  try {
    // 1차: 사진 설명(alt)에 한국 신호가 명확히 있는 것만 채택 (가장 안전)
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const photos = await searchPexels(apiKey, query, page);
      if (!photos.length) break;
      for (const photo of photos) {
        if (photo.width < MIN_ORIGINAL_WIDTH) continue;
        if (recentUrls.includes(photo.src.large2x)) continue;
        if (!KOREA_SIGNAL.test(photo.alt || '') && !KOREA_SIGNAL.test(photo.url || '')) continue;
        log.ok(`Pexels 한국 확인 이미지 확보: "${query}" (page ${page}, ${photo.width}px, alt="${photo.alt}") -> ${photo.url}`);
        return photo.src.large2x;
      }
    }

    // 2차: alt에 한국 신호가 없어도, "south korea"를 강제 포함한 검색이므로
    // 최소한의 관련성은 있다고 보고 고화질/미사용 조건만으로 채택 (완전 대안)
    log.warn(`"${query}" alt 설명에서 한국 신호를 확인 못함 — 검색 관련성만으로 재시도`);
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const photos = await searchPexels(apiKey, query, page);
      if (!photos.length) break;
      for (const photo of photos) {
        if (photo.width < MIN_ORIGINAL_WIDTH) continue;
        if (recentUrls.includes(photo.src.large2x)) continue;
        log.warn(`Pexels 이미지 확보(한국 미확인, 검색어 관련성만): "${query}" (page ${page}, ${photo.width}px) -> ${photo.url}`);
        return photo.src.large2x;
      }
    }
  } catch (err) {
    log.err(`Pexels 이미지 검색 실패: ${err.response?.data?.error || err.message}`);
    return null;
  }

  log.warn(`"${query}"로 이미지를 전혀 찾지 못해 이미지 없이 진행합니다.`);
  return null;
};

const fetchTopicImage = async (topic, recentUrls = [], seed = 0) => {
  const apiKey = process.env.PEXELS_API_KEY;
  const variants = TOPIC_QUERIES[topic];

  if (!apiKey || !variants) {
    log.warn(`PEXELS_API_KEY 또는 "${topic}" 검색어가 없어 이미지 검색을 건너뜁니다.`);
    return null;
  }

  const baseQuery = variants[seed % variants.length];
  return findKoreaPhoto(apiKey, baseQuery, recentUrls);
};

/**
 * Threads 캐로셀용으로 한 주제의 서로 다른 검색어 조합에서 최대 count장의
 * 한국 확인 이미지를 가져옵니다. 벤치마킹한 고성과 Threads 게시물들의 공통점 —
 * "1장에 정보를 다 담지 않고 2장째로 넘기게 만드는 구조" — 을 반영해, 첫 장은
 * seed로 고른 각도(훅), 다음 장은 같은 주제의 다른 각도(디테일/결론)로 채웁니다.
 * 확인된 이미지가 count장 미만이면 있는 만큼만 반환합니다(1장이면 캐로셀 대신
 * 단일 이미지로, 0장이면 텍스트만 발행하도록 호출부에서 처리).
 */
const fetchTopicImages = async (topic, recentUrls = [], seed = 0, count = 2) => {
  const apiKey = process.env.PEXELS_API_KEY;
  const variants = TOPIC_QUERIES[topic];

  if (!apiKey || !variants) {
    log.warn(`PEXELS_API_KEY 또는 "${topic}" 검색어가 없어 이미지 검색을 건너뜁니다.`);
    return [];
  }

  const images = [];
  const used = [...recentUrls];
  for (let i = 0; i < count; i += 1) {
    const query = variants[(seed + i) % variants.length];
    const url = await findKoreaPhoto(apiKey, query, used);
    if (url) {
      images.push(url);
      used.push(url); // 같은 게시글 안에서 두 장이 겹치지 않도록
    }
  }
  return images;
};

module.exports = { fetchTopicImage, fetchTopicImages, findKoreaPhoto, TOPIC_QUERIES };
