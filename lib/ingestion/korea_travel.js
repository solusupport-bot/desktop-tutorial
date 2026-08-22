const log = require('../logger');

/**
 * "Land in Korea" 브랜드용 실용 정보 소스.
 *
 * 이 저장소가 실행되는 CI(GitHub Actions) 환경은 일반 인터넷 접근이 가능하므로,
 * 실제 운영 시에는 아래 SOURCES의 참고 URL을 크롤링/RSS 구독해 최신 내용으로
 * 교체하는 것을 권장합니다 (CLAUDE.md의 Agent Reach 규칙 참고).
 *
 * 다만 이 시드 콘텐츠는 자주 바뀌지 않는 기초 사실(에버그린 정보) 위주로 작성했으며,
 * 특히 세금환급 한도·관광경보처럼 시점에 따라 달라질 수 있는 항목은 게시 전
 * 공식 채널(국세청, 외교부 등)에서 최신 수치를 확인한 뒤 발행할 것을 권장합니다.
 */
const SOURCES = [
  {
    topic: 'eSIM & mobile data',
    author: 'Land in Korea Desk',
    url: 'https://www.klook.com/en-US/blog/esim-korea/',
    content: 'Most Korean eSIM plans for tourists can be purchased online before arrival and activated by scanning a QR code once you land — no physical SIM swap needed. Coverage matches the big three Korean carriers (SKT, KT, LG U+). Typical tourist plans run 5-8 days with unlimited or high-cap data. Keep your home number active by using a secondary eSIM slot rather than replacing your primary SIM.'
  },
  {
    topic: 'T-money transit card',
    author: 'Land in Korea Desk',
    url: 'https://www.seoulmetro.co.kr',
    content: 'T-money is a rechargeable transit card sold at convenience stores (GS25, CU, 7-Eleven) and subway station kiosks for a small card fee. It works on subway, city buses, and many taxis nationwide — tap in and tap out, transfers between subway and bus within the transfer window are discounted. Balance and recharge are done with cash or card at convenience stores or station machines; unused balance can be partially refunded before leaving Korea.'
  },
  {
    topic: 'Tax refund (Tax Free) shopping',
    author: 'Land in Korea Desk',
    url: 'https://www.customs.go.kr',
    content: 'Tourists spending over the minimum threshold at Tax Free-affiliated stores can reclaim VAT paid on purchases. Ask for a Tax Free receipt/form at checkout, keep the item unused, and process the refund at airport kiosks (self-service or counter) before checking in your luggage if the item goes in checked baggage. Refund percentage varies by amount spent; check the current threshold and rate before your trip since these are adjusted periodically.'
  },
  {
    topic: 'Travel advisories & safety notices',
    author: 'Land in Korea Desk',
    url: 'https://www.mofa.go.kr',
    content: 'Korea is generally very safe for tourists, with low violent crime rates even late at night in major cities. Standard precautions still apply: watch for pickpockets in crowded markets, keep an eye on drinks in nightlife areas, and register with your home country\'s embassy notification service for real-time alerts during your stay. Check your government\'s official travel advisory page for Korea shortly before departure, since regional notices can change.'
  },
  {
    topic: 'Airport transfer options',
    author: 'Land in Korea Desk',
    url: 'https://www.airport.kr',
    content: 'From Incheon (ICN) or Gimpo (GMP) airport, the AREX airport railway is the cheapest and most predictable option into Seoul, with an express non-stop train to Seoul Station. Airport limousine buses drop closer to specific neighborhoods and hotels if you have heavy luggage. Taxis are metered and reliable but pricier during traffic; deluxe/international taxis at the airport accept card payment and English.'
  },
  {
    topic: 'First-timer etiquette & common mistakes',
    author: 'Land in Korea Desk',
    url: 'https://english.visitkorea.or.kr',
    content: 'Common first-timer mix-ups: tipping is not expected and can confuse service staff; escalators have a standing side by local custom (though rules vary by city); many small restaurants are cash-preferred or card-only with no split-bill custom; shoes usually come off indoors at traditional guesthouses and some restaurants with floor seating.'
  }
];

/**
 * Land in Korea 브랜드 주제 시드 콘텐츠를 반환합니다.
 * 실제 배포 환경에서는 이 함수를 실시간 크롤링/RSS 결과로 교체하세요.
 */
const fetchKoreaTravelTopics = async () => {
  log.section('Land in Korea 주제 수집');
  log.ok(`시드 소스 ${SOURCES.length}건 로드 완료`);
  return SOURCES.map((s) => ({
    source: s.topic,
    author: s.author,
    content: s.content,
    url: s.url
  }));
};

module.exports = { fetchKoreaTravelTopics, SOURCES };
