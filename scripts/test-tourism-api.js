#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { fetchRegionSamples } = require('../lib/ingestion/tourism_api');

const output = path.join(__dirname, '..', 'data', 'tourism-api-samples.json');

(async () => {
  const result = await fetchRegionSamples(['Seoul', 'Busan', 'Incheon']);
  fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n', 'utf8');
  console.log(`관광 API 샘플 저장 완료: ${output}`);
  for (const [region, services] of Object.entries(result.regions)) {
    for (const [service, value] of Object.entries(services)) {
      if (value.error) console.error(`[${region}/${service}] ${value.error}`);
      else console.log(`[${region}/${service}] ${value.count}건`);
    }
  }
  const errors = Object.values(result.regions).flatMap((services) =>
    Object.values(services).filter((value) => value.error)
  );
  if (errors.length) process.exitCode = 1;
})().catch((error) => {
  console.error(`관광 API 샘플 수집 실패: ${error.message}`);
  process.exit(1);
})();
