// 사진 검증 모델 단독 점검 (발행·큐 변경 없음). 2026-11-23 llava 폐기 사고 후 추가.
// Groq 키 없이 Cloudflare만으로 통과하는지 확인한다.
require('dotenv').config();
const { verifyImage, _test } = require('../lib/ingestion/media_guard');

(async () => {
  delete process.env.GROQ_API_KEY;
  const models = await _test.pickCloudflareModels(process.env.CLOUDFLARE_API_TOKEN, process.env.CLOUDFLARE_ACCOUNT_ID);
  console.log('CF 후보 모델:', models.join(', '));
  const korea = 'https://images.pexels.com/photos/2376711/pexels-photo-2376711.jpeg?auto=compress&cs=tinysrgb&w=1260';
  const ok = await verifyImage(korea, 'Gyeongbokgung Palace');
  console.log('RESULT_KOREA_PALACE=' + ok);
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
