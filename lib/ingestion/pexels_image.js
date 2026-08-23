const axios = require('axios');
const log = require('../logger');

const PEXELS_SEARCH_URL = 'https://api.pexels.com/v1/search';

// 주제별 실제 사진 검색어. korea_travel.js의 SOURCES[].topic과 키를 맞춥니다.
// 각 주제마다 여러 검색어 변형을 두어, 같은 주제가 다시 나와도 seed로 다른 검색어를
// 골라 매번 다른 사진(다른 구도/피사체)이 나오도록 합니다 — 이미지가 계속 똑같거나
// 밋밋해 보이는 것을 막기 위한 장치입니다.
const TOPIC_QUERIES = {
  'eSIM & mobile data': [
    'airport arrival hall travelers phone',
    'tourist using smartphone map outdoors',
    'airport departure board travel technology'
  ],
  'T-money transit card': [
    'seoul subway station platform commuters',
    'korea subway train interior modern',
    'city bus stop urban street asia'
  ],
  'Tax refund (Tax Free) shopping': [
    'seoul shopping street myeongdong',
    'korean department store shopping bags',
    'duty free shopping mall bright'
  ],
  'Travel advisories & safety notices': [
    'seoul city skyline night lights',
    'korea street night neon city',
    'asian city night cityscape aerial'
  ],
  'Airport transfer options': [
    'incheon airport train station modern',
    'airport shuttle bus arrival',
    'airport express train interior'
  ],
  'First-timer etiquette & common mistakes': [
    'traditional korean restaurant interior',
    'korean street food market vendor',
    'hanok village traditional korea'
  ],
  'Currency & card payments': [
    'contactless card payment cafe',
    'korean won cash currency',
    'cafe payment terminal asia'
  ],
  'Emergency numbers & 24hr pharmacies': [
    'pharmacy store front neon sign',
    'hospital exterior modern asia',
    'convenience store night city'
  ],
  'Useful travel apps': [
    'tourist smartphone map city street',
    'person using phone navigation city',
    'smartphone map application outdoors'
  ],
  'Convenience store hacks': [
    'korean convenience store interior',
    'convenience store snacks shelf',
    '24 hour store night city'
  ],
  'Seasonal packing & weather tips': [
    'seoul cherry blossom spring street',
    'korea autumn foliage mountain',
    'snow winter city street asia'
  ],
  'Luggage storage & forwarding services': [
    'airport luggage travel suitcase',
    'train station luggage lockers',
    'traveler suitcase city street'
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
