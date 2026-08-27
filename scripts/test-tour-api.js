#!/usr/bin/env node
// 한국관광공사 공공데이터 4개 API 실제 호출 테스트.
// 각 서비스의 정확한 오퍼레이션/파라미터는 사용자가 제공한 공식 가이드 문서
// (TourAPI_Guide_*.docx v4.1)에서 그대로 가져왔다 — 추측 없이 문서 그대로.
require('dotenv').config();
const axios = require('axios');
const log = require('../lib/logger');

const common = (extra = {}) => ({
  MobileOS: 'ETC',
  MobileApp: 'LandInKorea',
  _type: 'json',
  numOfRows: 5,
  pageNo: 1,
  ...extra
});

const call = async (label, url, params) => {
  log.section(label);
  try {
    const res = await axios.get(url, { params, timeout: 20000 });
    console.log(JSON.stringify(res.data, null, 2).slice(0, 2000));
    log.ok(`${label} 성공`);
  } catch (err) {
    log.err(`${label} 실패: ${err.response?.status} ${JSON.stringify(err.response?.data || err.message).slice(0, 500)}`);
  }
};

const main = async () => {
  // 1) 연관 관광지 정보 - 지역기반 (서울 종로구=11110 예시)
  await call(
    '연관 관광지 정보 (TarRlteTarService1/areaBasedList1)',
    'http://apis.data.go.kr/B551011/TarRlteTarService1/areaBasedList1',
    common({ serviceKey: process.env.TOUR_RELATED_ATTRACTIONS_API_KEY, baseYm: '202504', areaCd: '11', signguCd: '11110' })
  );

  // 2) 기초지자체 중심 관광지 정보 - 지역기반
  await call(
    '기초지자체 중심 관광지 정보 (LocgoHubTarService1/areaBasedList1)',
    'http://apis.data.go.kr/B551011/LocgoHubTarService1/areaBasedList1',
    common({ serviceKey: process.env.TOUR_CORE_ATTRACTIONS_API_KEY, baseYm: '202504', areaCd: '11', signguCd: '11110' })
  );

  // 3) 관광지 집중률 방문자 추이 예측 정보
  await call(
    '관광지 집중률 방문자 추이 예측 (TatsCnctrRateService/tatsCnctrRatedList)',
    'http://apis.data.go.kr/B551011/TatsCnctrRateService/tatsCnctrRatedList',
    common({ serviceKey: process.env.TOUR_VISITOR_FORECAST_API_KEY, areaCd: '11', signguCd: '11110' })
  );

  // 4) 오디오 가이드 정보 - 키워드 검색 (경복궁)
  await call(
    '오디오 가이드 정보 (Odii/themeSearchList, keyword=경복궁)',
    'http://apis.data.go.kr/B551011/Odii/themeSearchList',
    common({ serviceKey: process.env.TOUR_AUDIO_GUIDE_API_KEY, keyword: '경복궁', langCode: 'ko' })
  );
};

main();
