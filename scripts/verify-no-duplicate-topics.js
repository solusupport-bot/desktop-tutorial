#!/usr/bin/env node
// 2026-10-08: data/topic_bank.json 전체를 쌍쌍이 훑어서 근접 중복 주제(문구만
// 줄이거나 바꾼 "사실상 같은 주제")를 잡아낸다. 실제로 5쌍이 몇 주 동안 숨어
// 있었고 그중 4개는 블로그에 중복 발행까지 됐다(topic_similarity.js 주석 참고).
// scripts/verify-topic-media-alignment.js와 같은 자리에서, 새 주제를 손으로
// 추가한 뒤에도 반드시 같이 실행할 것.
//
// 실행: node scripts/verify-no-duplicate-topics.js
const fs = require('fs');
const path = require('path');
const log = require('../lib/logger');
const { isNearDuplicateTopic } = require('../lib/ingestion/topic_similarity');

const TOPIC_BANK_PATH = path.join(__dirname, '..', 'data', 'topic_bank.json');

const main = () => {
  const bank = JSON.parse(fs.readFileSync(TOPIC_BANK_PATH, 'utf8'));
  const pairs = [];

  for (let i = 0; i < bank.length; i += 1) {
    for (let j = i + 1; j < bank.length; j += 1) {
      if (isNearDuplicateTopic(bank[i].topic, bank[j].topic)) {
        pairs.push([bank[i].topic, bank[j].topic]);
      }
    }
  }

  if (!pairs.length) {
    log.ok(`근접 중복 검증 통과 — 주제 ${bank.length}개 중 중복 없음.`);
    return;
  }

  log.err(`근접 중복 주제 ${pairs.length}쌍 발견:`);
  pairs.forEach(([a, b]) => log.err(`  - "${a}"  ~  "${b}"`));
  process.exit(1);
};

main();
