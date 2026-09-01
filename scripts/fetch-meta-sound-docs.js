#!/usr/bin/env node
// 일회성 진단: 이 세션(로컬 샌드박스)에선 facebook.com이 네트워크 정책으로 차단돼
// 있어서, GitHub Actions 러너(정상 인터넷)를 통해 Meta Sound Collection
// (facebook.com/sound) 페이지 구조를 확인한다 — 다운로드/검색이 API로 되는지,
// 로그인이 꼭 필요한지 확인 목적.
const https = require('https');

const fetchUrl = (url) => new Promise((resolve, reject) => {
  https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
  }).on('error', reject);
});

const main = async () => {
  const res = await fetchUrl('https://www.facebook.com/sound');
  console.log('STATUS:', res.status);
  console.log('LENGTH:', res.body.length);
  console.log('--- first 3000 chars ---');
  console.log(res.body.slice(0, 3000));
  console.log('--- search for api/graphql hints ---');
  const hints = res.body.match(/["'](\/[a-zA-Z0-9_/]*sound[a-zA-Z0-9_/]*)["']/gi) || [];
  console.log([...new Set(hints)].slice(0, 30));
};

main().catch((err) => { console.error('FETCH_FAILED', err.message); process.exit(1); });
