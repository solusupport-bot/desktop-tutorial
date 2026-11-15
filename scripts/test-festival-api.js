#!/usr/bin/env node
// 한국관광공사 KorService2/searchFestival2(지역축제 정보) 호출 테스트.
// 2026-10-18 세션 기록상 이 API로 서울 축제 후보를 조회한 적이 있는데, 그때 쓴
// 서비스키가 어느 환경변수였는지 코드에 남아있지 않다 — data.go.kr 일반 인증키는
// 계정당 하나를 여러 "활용신청" 상품에 재사용하는 경우가 많으므로, 이미 등록된
// 4개 TourAPI 키를 전부 시도해 어느 것이 이 상품에도 승인돼 있는지 확인한다.
//
// 결과는 콘솔뿐 아니라 data/festival_api_probe.json에도 남긴다 — 이 스크립트는
// GitHub Actions에서 실행되고, 이 세션엔 Actions 로그를 읽을 권한이 없어서
// 커밋된 결과 파일로 확인하는 방식을 쓴다.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const log = require('../lib/logger');
const { normalizeServiceKey } = require('../lib/ingestion/tour_service_key');

const CANDIDATE_KEYS = [
  'TOUR_RELATED_ATTRACTIONS_API_KEY',
  'TOUR_CORE_ATTRACTIONS_API_KEY',
  'TOUR_VISITOR_FORECAST_API_KEY',
  'TOUR_AUDIO_GUIDE_API_KEY'
];

const OUT_PATH = path.join(__dirname, '..', 'data', 'festival_api_probe.json');

const tryKey = async (envName) => {
  const raw = process.env[envName];
  if (!raw) {
    log.warn(`${envName} — 값 없음, 건너뜀`);
    return { envName, ok: false, reason: 'no value set' };
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

    // data.go.kr returns XML even on JSON requests for some error cases
    // (e.g. SERVICE_KEY_IS_NOT_REGISTERED_ERROR) — detect that before assuming res.data is an object.
    if (typeof res.data === 'string') {
      log.err(`${envName} — JSON이 아닌 응답(보통 미승인/키 오류): ${res.data.slice(0, 200)}`);
      return { envName, ok: false, reason: 'non-JSON response', raw: res.data.slice(0, 300) };
    }

    const header = res.data?.response?.header;
    if (header && header.resultCode !== '0000') {
      log.err(`${envName} — API 응답 오류: ${header.resultCode} ${header.resultMsg}`);
      return { envName, ok: false, reason: `${header.resultCode} ${header.resultMsg}` };
    }

    const items = res.data?.response?.body?.items?.item || [];
    log.ok(`${envName} — 성공, ${items.length}건 수신`);
    const sample = items.slice(0, 10).map((it) => ({
      title: it.title, addr1: it.addr1, start: it.eventstartdate, end: it.eventenddate
    }));
    sample.forEach((s) => console.log(`  - ${s.title} | ${s.addr1} | ${s.start}~${s.end}`));
    return { envName, ok: true, count: items.length, sample };
  } catch (err) {
    const detail = err.response?.data;
    const detailStr = typeof detail === 'string' ? detail.slice(0, 300) : JSON.stringify(detail || err.message).slice(0, 300);
    log.err(`${envName} — 호출 실패: ${err.response?.status} ${detailStr}`);
    return { envName, ok: false, reason: `HTTP ${err.response?.status}: ${detailStr}` };
  }
};

const main = async () => {
  log.section('KorService2/searchFestival2 — 4개 기존 키로 시도');
  const results = [];
  for (const envName of CANDIDATE_KEYS) {
    results.push(await tryKey(envName));
  }
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, `${JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2)}\n`, 'utf8');
  log.ok(`결과 저장: ${OUT_PATH}`);
};

main();
