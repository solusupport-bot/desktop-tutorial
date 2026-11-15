#!/usr/bin/env node
// 한국관광공사 KorService2/searchFestival2(지역축제 정보) 호출 테스트.
// 2026-10-18 세션 기록상 이 API로 서울 축제 후보를 조회한 적이 있는데, 그때 쓴
// 서비스키가 어느 환경변수였는지 코드에 남아있지 않다 — data.go.kr 일반 인증키는
// 계정당 하나를 여러 "활용신청" 상품에 재사용하는 경우가 많으므로, 이미 등록된
// 4개 TourAPI 키를 전부 시도해 어느 것이 이 상품에도 승인돼 있는지 확인한다.
require('dotenv').config();
const axios = require('axios');
const log = require('../lib/logger');
const { normalizeServiceKey } = require('../lib/ingestion/tour_service_key');

const CANDIDATE_KEYS = [
  'TOUR_RELATED_ATTRACTIONS_API_KEY',
  'TOUR_CORE_ATTRACTIONS_API_KEY',
  'TOUR_VISITOR_FORECAST_API_KEY',
  'TOUR_AUDIO_GUIDE_API_KEY'
];

const tryKey = async (envName) => {
  const raw = process.env[envName];
  if (!raw) {
    log.warn(`${envName} — 값 없음, 건너뜀`);
    return;
  }
  const serviceKey = normalizeServiceKey(raw);
  try {
    const res = await axios.get('https://apis.data.go.kr/B551011/KorService2/searchFestival2', {
      params: {
        serviceKey,
        MobileOS: 'ETC',
        MobileApp: 'LandInKorea',
        _type: 'json',
        numOfRows: 10,
        pageNo: 1,
        arrange: 'A',
        eventStartDate: '20261115'
      },
      timeout: 20000
    });
    const header = res.data?.response?.header;
    if (header && header.resultCode !== '0000') {
      log.err(`${envName} — API 응답 오류: ${header.resultCode} ${header.resultMsg}`);
      return;
    }
    const items = res.data?.response?.body?.items?.item || [];
    log.ok(`${envName} — 성공, ${items.length}건 수신`);
    items.slice(0, 5).forEach((it) => {
      console.log(`  - ${it.title} | ${it.addr1} | ${it.eventstartdate}~${it.eventenddate}`);
    });
  } catch (err) {
    log.err(`${envName} — 호출 실패: ${err.response?.status} ${JSON.stringify(err.response?.data || err.message).slice(0, 300)}`);
  }
};

const main = async () => {
  log.section('KorService2/searchFestival2 — 4개 기존 키로 시도');
  for (const envName of CANDIDATE_KEYS) {
    await tryKey(envName);
  }
};

main();
