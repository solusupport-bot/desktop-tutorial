#!/usr/bin/env node
// 한국관광공사 공공데이터 4개 API 실제 호출 테스트.
// 각 서비스의 정확한 오퍼레이션/파라미터는 사용자가 제공한 공식 가이드 문서
// (TourAPI_Guide_*.docx v4.1)에서 그대로 가져왔다 — 추측 없이 문서 그대로.
require('dotenv').config();
const axios = require('axios');
const log = require('../lib/logger');
const { normalizeServiceKey } = require('../lib/ingestion/tour_service_key');

const common = (extra = {}) => ({
  MobileOS: 'ETC',
  MobileApp: 'LandInKorea',
  _type: 'json',
  numOfRows: 5,
  pageNo: 1,
  ...extra
});

// 이전 버전은 실패해도 catch에서 로그만 찍고 넘어가서, 4개가 전부 실패해도
// 프로세스 종료 코드가 0이 되어 GitHub Actions 화면에 "success"로 잘못 표시됐다.
// (실제로 이것 때문에 다른 세션이 실패한 실행을 "성공"으로 오인한 적이 있음.)
// 이제 하나라도 실패하면 exitCode를 1로 남겨 화면의 성공/실패가 실제와 일치하게 한다.
let hadFailure = false;

const call = async (label, url, params) => {
  log.section(label);
  try {
    const res = await axios.get(url, { params, timeout: 20000 });
    console.log(JSON.stringify(res.data, null, 2).slice(0, 2000));
    log.ok(`${label} 성공`);
  } catch (err) {
    hadFailure = true;
    log.err(`${label} 실패: ${err.response?.status} ${JSON.stringify(err.response?.data || err.message).slice(0, 500)}`);
  }
};

const main = async () => {
  // 1) 연관 관광지 정보 - 지역기반 (서울 종로구=11110 예시)
  await call(
    '연관 관광지 정보 (TarRlteTarService1/areaBasedList1)',
    'https://apis.data.go.kr/B551011/TarRlteTarService1/areaBasedList1',
    common({ serviceKey: normalizeServiceKey(process.env.TOUR_RELATED_ATTRACTIONS_API_KEY), baseYm: '202504', areaCd: '11', signguCd: '11110' })
  );

  // 2) 기초지자체 중심 관광지 정보 - 지역기반
  await call(
    '기초지자체 중심 관광지 정보 (LocgoHubTarService1/areaBasedList1)',
    'https://apis.data.go.kr/B551011/LocgoHubTarService1/areaBasedList1',
    common({ serviceKey: normalizeServiceKey(process.env.TOUR_CORE_ATTRACTIONS_API_KEY), baseYm: '202504', areaCd: '11', signguCd: '11110' })
  );

  // 3) 관광지 집중률 방문자 추이 예측 정보
  await call(
    '관광지 집중률 방문자 추이 예측 (TatsCnctrRateService/tatsCnctrRatedList)',
    'https://apis.data.go.kr/B551011/TatsCnctrRateService/tatsCnctrRatedList',
    common({ serviceKey: normalizeServiceKey(process.env.TOUR_VISITOR_FORECAST_API_KEY), areaCd: '11', signguCd: '11110' })
  );

  // 4) 오디오 가이드 정보 - 키워드 검색 (경복궁)
  await call(
    '오디오 가이드 정보 (Odii/themeSearchList, keyword=경복궁)',
    'https://apis.data.go.kr/B551011/Odii/themeSearchList',
    common({ serviceKey: normalizeServiceKey(process.env.TOUR_AUDIO_GUIDE_API_KEY), keyword: '경복궁', langCode: 'ko' })
  );

  if (hadFailure) process.exitCode = 1;
};

main();
