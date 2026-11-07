const axios = require('axios');
const log = require('../logger');

const LATEST_PRICES_URL = 'https://api.travelpayouts.com/v2/prices/latest';

/**
 * 2026-11-07 사용자 요청: 항공료 제휴(Travelpayouts/Aviasales)에 더해, 블로그 글 본문에
 * "서울행 항공료는 보통 $X" 같은 구체적 숫자를 넣을 때 쓸 캐시된 참고가격 소스.
 * 사용자 본인이 명시: "실시간 확정 가격이 아닌 캐시된 참고 가격" — 다른 여행객들이 실제로
 * 찾은(예약까지는 모름) 최근 운임을 모아둔 것이라 흥정폭을 보여주는 용도지 "지금 이 가격에
 * 살 수 있다"는 보장이 아니다. [[feedback_landinkorea_informational_depth_rule]] 규칙대로
 * 쓸 때는 반드시 "YYYY-MM-DD 기준 캐시된 참고가" 같은 헷징 없는 날짜+출처 표기를 붙여야 한다.
 *
 * destination은 공항코드(ICN/PUS/CJU)가 아니라 도시코드(SEL/PUS/CJU)를 써야 서울 3개 공항이
 * 전부 합쳐 조회된다(관광공사 API와 다른 관례 — 실측: origin=ICN을 줘도 응답은 SEL로 묶여 나옴).
 *
 * TRAVELPAYOUTS_API_TOKEN 없으면 조용히 null을 반환한다(다른 ingestion 모듈과 동일 규칙).
 */
const getCachedFare = async (origin, destinationCity = 'SEL', currency = 'usd') => {
  const token = process.env.TRAVELPAYOUTS_API_TOKEN;
  if (!token) return null;
  try {
    const res = await axios.get(LATEST_PRICES_URL, {
      params: { origin, destination: destinationCity, currency, token, limit: 30, page: 1 },
      timeout: 15000
    });
    // sorting=price 파라미터는 이 토큰 등급에서 401을 유발한다(실측) — 서버 정렬 없이
    // 여러 건을 받아 클라이언트에서 최저가를 고른다.
    const hits = res.data?.data || [];
    const hit = hits.slice().sort((a, b) => a.value - b.value)[0];
    if (!hit) {
      log.warn(`Travelpayouts 캐시 요금 없음: ${origin} -> ${destinationCity}`);
      return null;
    }
    return {
      origin: hit.origin,
      destination: hit.destination,
      price: hit.value,
      currency: res.data.currency,
      foundAt: hit.found_at,
      departDate: hit.depart_date,
      returnDate: hit.return_date || null,
      gate: hit.gate
    };
  } catch (err) {
    log.warn(`Travelpayouts 캐시 요금 조회 실패(${origin} -> ${destinationCity}): ${err.response?.data?.error || err.message}`);
    return null;
  }
};

module.exports = { getCachedFare };
