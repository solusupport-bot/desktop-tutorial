#!/usr/bin/env node
require('dotenv').config();
const log = require('../lib/logger');
const { fetchMainstreamTrends } = require('../lib/ingestion/twitter_threads');
const { fetchOpinionLeaderPosts } = require('../lib/ingestion/opinions');
const { fetchTechDeepDive } = require('../lib/ingestion/tech_deepdive');

const main = async () => {
  log.section('트렌드 수집 파이프라인');

  const results = await Promise.allSettled([
    fetchMainstreamTrends(),
    fetchOpinionLeaderPosts(),
    fetchTechDeepDive()
  ]);

  const combined = [];
  results.forEach((r) => {
    if (r.status === 'fulfilled') combined.push(...r.value);
    else log.err(`수집 파트 실패: ${r.reason?.message}`);
  });

  log.ok(`총 ${combined.length}개 원본 데이터 수집 완료. output/ 폴더를 확인하세요.`);
};

main();
