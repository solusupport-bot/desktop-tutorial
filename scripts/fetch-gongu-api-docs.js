#!/usr/bin/env node
// 일회성 진단 스크립트: 이 세션(로컬 샌드박스)에선 gongu.copyright.or.kr가
// 네트워크 정책으로 차단돼 있어서, GitHub Actions 러너(정상 인터넷)를 통해
// 실제 API 안내 페이지 HTML을 가져와 파라미터/엔드포인트를 확인한다.
const https = require('https');

const fetchUrl = (url) => new Promise((resolve, reject) => {
  https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => resolve({ status: res.statusCode, body: data }));
  }).on('error', reject);
});

const main = async () => {
  const res = await fetchUrl('https://gongu.copyright.or.kr/gongu/useReqst/apiKey/info.do?menuNo=200245');
  console.log('STATUS:', res.status);
  console.log('LENGTH:', res.body.length);
  console.log(res.body);
};

main().catch((err) => { console.error('FETCH_FAILED', err.message); process.exit(1); });
