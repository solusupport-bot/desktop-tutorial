#!/usr/bin/env node
require('dotenv').config();
const log = require('../lib/logger');
const { fetchKoreaTravelTopics } = require('../lib/ingestion/korea_travel');

const main = async () => {
  log.section('Land in Korea 주제 수집 파이프라인');

  const results = await Promise.allSettled([
    fetchKoreaTravelTopics()
  ]);

  const combined = [];
  results.forEach((r) => {
    if (r.status === 'fulfilled') combined.push(...r.value);
    else log.err(`수집 파트 실패: ${r.reason?.message}`);
  });

  log.ok(`총 ${combined.length}개 원본 데이터 수집 완료.`);
};

main();
