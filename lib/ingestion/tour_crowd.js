const axios = require('axios');
const log = require('../logger');
const { normalizeServiceKey } = require('./tour_service_key');

/**
 * 한국관광공사 "관광지 집중률 방문자 추이 예측 정보" (TatsCnctrRateService) 라이브 연동.
 * 실제 호출로 검증된 지역만 쓴다 — 서울 종로구(경복궁 일대), areaCd=11 / signguCd=11110.
 * 다른 구 코드는 이 프로젝트에서 실제 호출로 검증한 적이 없으므로 추측해서 넣지 않는다
 * (다른 세션이 검증 없이 지역 코드를 추측해 넣었다가 틀렸던 사례가 있었음).
 */
const AREA = { areaCd: '11', signguCd: '11110', label: 'Jongno-gu, Seoul (Gyeongbokgung area)' };

const fetchCrowdForecast = async () => {
  const serviceKey = normalizeServiceKey(process.env.TOUR_VISITOR_FORECAST_API_KEY);
  if (!serviceKey) {
    log.warn('TOUR_VISITOR_FORECAST_API_KEY가 없어 혼잡도 예측 데이터를 건너뜁니다.');
    return null;
  }
  try {
    const res = await axios.get('https://apis.data.go.kr/B551011/TatsCnctrRateService/tatsCnctrRatedList', {
      params: {
        serviceKey,
        MobileOS: 'ETC',
        MobileApp: 'LandInKorea',
        _type: 'json',
        numOfRows: 10,
        pageNo: 1,
        areaCd: AREA.areaCd,
        signguCd: AREA.signguCd
      },
      timeout: 15000
    });
    const items = res.data?.response?.body?.items?.item || [];
    if (!items.length) return null;
    return items.map((it) => ({ name: it.tAtsNm, date: it.baseYmd, rate: Number(it.cnctrRate) }));
  } catch (err) {
    log.err(`혼잡도 예측 API 실패: ${err.response?.data?.error?.message || err.message}`);
    return null;
  }
};

const formatDate = (ymd) => `${ymd.slice(4, 6)}/${ymd.slice(6, 8)}`;

/**
 * 실제 API로 받은 예측치를 2개의 서로 다른 각도(가장 붐빔 / 가장 한산함)로 재구성합니다.
 * 지어낸 수치가 아니라 그 시점 실제 응답값을 그대로 문장에 반영합니다.
 */
const buildCrowdContentAngles = (items) => {
  const sorted = [...items].sort((a, b) => b.rate - a.rate);
  const busiest = sorted[0];
  const quietest = sorted[sorted.length - 1];
  if (!busiest || !quietest || busiest === quietest) return null;

  const angle0 = `A spot in ${AREA.label} — ${busiest.name} — is projected to hit ${busiest.rate}% visitor concentration on ${formatDate(busiest.date)}, per Korea Tourism Organization's own forecast data. Most itineraries get built around opening hours, not projected crowd levels, so this kind of day-by-day forecast rarely makes it into a blog post. If your dates are flexible, checking a projected crowd number before you commit can save you a wasted, overcrowded visit.`;
  const angle1 = `Same district, opposite problem: ${quietest.name} in ${AREA.label} is projected at just ${quietest.rate}% visitor concentration on ${formatDate(quietest.date)}, based on the same official forecast data. Popular attractions swing hard between crowded and quiet days depending on the calendar, not just weekday vs weekend. Worth checking before you lock in a date if you have any flexibility.`;

  return [angle0, angle1];
};

module.exports = { fetchCrowdForecast, buildCrowdContentAngles, AREA };
