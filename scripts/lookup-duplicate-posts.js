#!/usr/bin/env node
// 일회성 진단 스크립트: 2026-09-01 스케줄러 중복 발행 사고(수동 재시도 dispatch와
// 마침 그 순간 다시 돌아온 cron이 겹쳐 같은 큐 항목 3개가 두 번씩 발행됨)로 생긴
// 중복 게시물 6개의 실제 공개 URL을 조회한다. 삭제는 하지 않고 링크만 보여준다 —
// 사용자에게 먼저 확인받고 지운다.
require('dotenv').config();
const log = require('../lib/logger');
const { getPermalink } = require('../lib/publishing/permalink');

const TARGETS = [
  { label: 'Run 231 (수동 dispatch) - Threads', platform: 'threads', id: '18119626780905494' },
  { label: 'Run 231 (수동 dispatch) - Facebook', platform: 'facebook', id: '1597309398791784' },
  { label: 'Run 231 (수동 dispatch) - Instagram', platform: 'instagram', id: '18108003937885349' },
  { label: 'Run 232 (자동 cron) - Threads', platform: 'threads', id: '18331987438273737' },
  { label: 'Run 232 (자동 cron) - Facebook', platform: 'facebook', id: '1504216911910154' },
  { label: 'Run 232 (자동 cron) - Instagram', platform: 'instagram', id: '18362578414212601' }
];

const main = async () => {
  for (const t of TARGETS) {
    try {
      const data = await getPermalink(t.platform, t.id);
      log.ok(`${t.label} (${t.id}): ${data.permalink || data.permalink_url || JSON.stringify(data)}`);
    } catch (err) {
      log.err(`${t.label} (${t.id}) 조회 실패: ${err.response?.data?.error?.message || err.message}`);
    }
  }
};

main();
