const path = require('path');
const https = require('https');
const axios = require('axios');
const log = require('../logger');

/**
 * SNS 사진/영상을 Cloudflare Workers KV(sns_media)에 올리고, land-in-korea Worker의
 * _worker.js가 /sns-media/* 요청을 그 KV에서 바로 서빙한다. 블로그 사이트(정적 자산)와는
 * 완전히 분리돼 있어 미디어를 올릴 때 사이트 전체를 재배포하지 않는다.
 * (2026-10-24: 예전엔 업로드마다 wrangler deploy로 사이트 전체를 다시 배포했는데, 그
 * 과정에서 로컬에 남아있던 오래된 빌드가 승인된 홈페이지를 덮어쓴 사고가 있었다 —
 * landinkorea_site/wrangler.jsonc + _worker.js의 run_worker_first 라우팅 참고.)
 */
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || '1fc45e0d4565a48335045c78ec9d6f27';
const KV_NAMESPACE_ID = process.env.SNS_MEDIA_KV_NAMESPACE_ID || '17283bbc49e34bc8b1cd98187f994157';
const MEDIA_DIR = 'sns-media';
const PUBLIC_BASE = `https://landinkorea.com/${MEDIA_DIR}`;

const CONTENT_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm'
};

const contentTypeFor = (relativePath) => CONTENT_TYPES[path.extname(relativePath).toLowerCase()] || 'application/octet-stream';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// KV 쓰기 직후 바로 읽으면 엣지 전파가 아직 안 끝나 멀쩡한 업로드도 404로 잡힐 수 있다
// (deploySite 시절부터 있던 문제, KV도 전역 전파라 똑같이 적용) — 몇 초 간격으로 재시도.
const getWithRetry = async (url, expectedContentType, { attempts = 4, delayMs = 2000 } = {}) => {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await axios.get(url, { timeout: 30000, responseType: 'arraybuffer' });
      const ct = res.headers['content-type'] || '';
      if (res.status === 200 && ct.split(';')[0] === expectedContentType) return;
      throw new Error(`unexpected response (status ${res.status}, content-type ${ct})`);
    } catch (err) {
      if (i === attempts - 1) throw err;
      await sleep(delayMs);
    }
  }
};

// 2026-11-03: 예전엔 로컬 `wrangler login` OAuth 토큰 파일을 직접 읽어 썼는데, wrangler
// 자체의 자동 갱신 로직을 거치지 않아 토큰이 종종 만료 상태로 남아 401이 났고(실측 — `wrangler
// whoami`를 수동으로 한 번 실행해야만 갱신됐다), 그 파일이 이 PC에만 있어 GitHub Actions에서는
// 애초에 동작하지 않았다. Account > Workers KV Storage 편집 권한의 고정 API 토큰으로 교체.
const putOne = (relativePath, buffer, contentType) => {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error('CLOUDFLARE_API_TOKEN 환경 변수가 없습니다 — Cloudflare 대시보드에서 API 토큰 발급 필요');
  // _worker.js가 '/sns-media/' 뒤의 나머지만 키로 쓰므로 여기서도 접두어 없이 저장한다.
  const key = relativePath;
  const boundary = `----likboundary${Date.now()}`;
  const metadataPart = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({ contentType })}\r\n`
  );
  const valueHeader = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="value"\r\nContent-Type: application/octet-stream\r\n\r\n`
  );
  const closing = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([metadataPart, valueHeader, buffer, closing]);

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.cloudflare.com',
      path: `/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${KV_NAMESPACE_ID}/values/${encodeURIComponent(key)}`,
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length
      },
      timeout: 60000
    }, (res) => {
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`KV 쓰기 실패 (status ${res.statusCode}): ${data.slice(0, 500)}`));
          return;
        }
        const parsed = JSON.parse(data);
        if (!parsed.success) {
          reject(new Error(`KV 쓰기 실패: ${JSON.stringify(parsed.errors)}`));
          return;
        }
        resolve();
      });
    });
    req.on('error', reject);
    req.end(body);
  });
};

// 업로드가 "성공"이라고 보고하기 전에 실제 공개 URL이 응답하는지, 사진/영상으로 열리는지
// (content-type 일치) 확인한다. 확인 못 하면 실패로 던진다 — 호출부의 기존 재시도/실패
// 처리를 그대로 따르게 하기 위해 여기서 성공을 위장하지 않는다.
const uploadMediaFile = async (buffer, relativePath) => {
  const contentType = contentTypeFor(relativePath);
  await putOne(relativePath, buffer, contentType);

  const url = `${PUBLIC_BASE}/${relativePath}`;
  await getWithRetry(url, contentType);
  log.ok(`미디어를 landinkorea.com으로 호스팅: ${url}`);
  return url;
};

/**
 * 여러 파일을 KV에 올린다(카드뉴스처럼 한 세트가 여러 장인 경우). 각 파일은 독립된 KV
 * 쓰기라 사이트 재배포 같은 공유 상태가 없으므로 그냥 순서대로 올리고 각각 확인한다.
 */
const uploadMediaFiles = async (files) => {
  const urls = [];
  for (const { buffer, relativePath } of files) {
    const contentType = contentTypeFor(relativePath);
    await putOne(relativePath, buffer, contentType);
    const url = `${PUBLIC_BASE}/${relativePath}`;
    await getWithRetry(url, contentType);
    urls.push(url);
  }
  log.ok(`미디어 ${files.length}개를 landinkorea.com으로 일괄 호스팅 완료`);
  return urls;
};

module.exports = { uploadMediaFile, uploadMediaFiles, MEDIA_DIR, PUBLIC_BASE };
