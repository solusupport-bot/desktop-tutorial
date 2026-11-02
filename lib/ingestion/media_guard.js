// 2026-10-12 사용자 하드룰: "SNS고 블로그고 키워드에 맞는 정확한 이미지와 영상이 나와야 된다,
// 확인을 하고 올려" + "화질 낮은 건 사용금지" + "중복 이미지·영상도 안 됨".
// 이 파일이 미디어 3대 원칙의 마지막 관문이다:
//  - isUsed: 중복 검사를 URL 문자열이 아니라 사진/영상 고유번호로 한다(같은 Pexels 사진이
//    ?w=940, large2x 등 주소만 달라 중복 검사를 빠져나가던 구멍).
//  - verifyMedia: 실제 화면을 Groq 무료 비전 모델이 보고 "한국인지 / 주제와 맞는지 /
//    한국인지 / 주제와 맞는지"를 판정한다. 화질은 판정에 넣지 않는다 — 이 모델은 큰 사진을
//    조각으로 보고 멀쩡한 사진을 "콜라주·흐림"으로 오판했다(실측). 화질은 각 수집기의 해상도
//    하한(사진 원본 2000px, 영상 가로 1080px)으로 숫자로 거른다. 슬러그·태그 단어만 보던 검사는 '계절별 짐싸기' 고정 사진이
//    사실 일본 거리 사진인 것도 못 잡았다(2026-10-12 실측).
// 확인을 못 하면(키 없음, API 실패) 통과시키지 않는다 — 확인 안 된 미디어는 올리지 않는다.
const axios = require('axios');
const log = require('../logger');

const VISION_MODEL = process.env.GROQ_VISION_MODEL || 'qwen/qwen3.8-27b';
// 2026-11-02 사용자 요청: Groq 무료 비전 한도가 이틀 연속 하루 토큰 한도에 막혀 사진 검증 자체가
// 멈췄다 — "같은 문제가 반복되면 대체 플랫폼부터 찾아라"는 규칙에 따라 Cloudflare Workers AI를
// 1순위로 두고(이미 landinkorea.com을 Cloudflare Worker로 서빙 중이라 같은 계정 재사용, 하루
// 10,000 Neurons 무료, Groq와 완전히 별개 쿼터), Groq는 2순위 폴백으로 남긴다.
// llama-3.2-11b-vision은 계정당 한 번 "agree" 프롬프트로 커뮤니티 라이선스에 동의해야 쓸 수 있어
// (법적 동의라 자동화가 대신 할 수 없음) — 그런 동의 절차가 없는 llava로 기본값을 둔다.
const CF_VISION_MODEL = process.env.CLOUDFLARE_VISION_MODEL || '@cf/llava-hf/llava-1.5-7b-hf';
// 사용자 하드룰 "화질 낮은 건 사용금지" — 출처와 상관없이(관광공사 사진엔 하한이 아예 없었다)
// 실제로 받아서 잰 가로 픽셀이 이보다 작으면 쓰지 않는다. 영상 수집기의 MIN_VIDEO_WIDTH와 같은 값.
// 2026-10-13 사용자 결정(2번): 한 단계 낮춤 — SNS는 1080px로 표시되므로 눈에 띄는 차이 없음. 이보다 더 낮추지 말 것.
const MIN_IMAGE_WIDTH = 1080;

const imageWidth = async (url) => {
  const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
  const { width } = await require('sharp')(Buffer.from(res.data)).metadata();
  return width || 0;
};

const mediaKey = (url) => {
  const u = String(url || '');
  const m = u.match(/pexels\.com\/photos\/(\d+)/)
    || u.match(/pexels\.com\/video-files\/(\d+)/)
    || u.match(/pexels\.com\/videos\/(\d+)/)
    || u.match(/pixabay\.com\/video\/\d{4}\/\d{2}\/\d{2}\/(\d+)[-_]/)
    || u.match(/#pixabay=(\d+)/);
  if (m) return `${u.includes('pixabay') ? 'pixabay' : 'pexels'}:${m[1]}`;
  return u.split('?')[0];
};

/** recentUrls 중에 같은 사진/영상(고유번호 기준)이 있으면 true. */
const isUsed = (recentUrls, url) => {
  const key = mediaKey(url);
  return (recentUrls || []).some((r) => mediaKey(r) === key);
};

/** 영상은 화면을 직접 못 보내니 대표 프레임(썸네일) 주소를 구한다. 못 구하면 null. */
const videoThumbnail = async (videoUrl) => {
  const key = mediaKey(videoUrl);
  const [provider, id] = key.split(':');
  try {
    if (provider === 'pexels' && id) {
      const res = await axios.get(`https://api.pexels.com/videos/videos/${id}`, {
        headers: { Authorization: process.env.PEXELS_API_KEY }, timeout: 15000
      });
      return res.data?.image || null;
    }
    if (provider === 'pixabay' && id) {
      const res = await axios.get('https://pixabay.com/api/videos/', {
        params: { key: process.env.PIXABAY_API_KEY, id }, timeout: 15000
      });
      const v = res.data?.hits?.[0]?.videos;
      return v?.large?.thumbnail || v?.medium?.thumbnail || null;
    }
  } catch (err) {
    log.warn(`영상 대표 프레임 조회 실패(${key}): ${err.message}`);
  }
  return null;
};

const VISION_PROMPT = (topic) => `You check media for "Land in Korea", a travel/life account about SOUTH KOREA.
The post topic is: "${topic}"

This is ONE single photo. Answer strictly:
1. korea: Is it in South Korea? If it looks like another country, answer false.
2. topic: Does it clearly show the subject of the topic (not just a generic city/street/scenery shot)? A season, place, or object that contradicts the topic is false.

Respond ONLY with JSON: {"korea": true|false, "topic": true|false, "what": "one short sentence of what the photo shows"}`;

/**
 * imageUrl(사진 또는 영상 대표 프레임)이 topic에 맞는 한국 미디어면 true.
 * 판정 근거는 로그로 남긴다. Cloudflare Workers AI를 먼저 쓰고, 없거나 실패하면 Groq로 폴백한다.
 */
const verifyImage = async (imageUrl, topic) => {
  if (!imageUrl) {
    log.warn(`미디어 확인 불가(이미지 주소 없음) → 사용 안 함: ${imageUrl}`);
    return false;
  }
  const cfToken = process.env.CLOUDFLARE_API_TOKEN;
  const cfAccount = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (cfToken && cfAccount) {
    try {
      return await askVisionCloudflare(cfToken, cfAccount, imageUrl, topic);
    } catch (err) {
      const msg = err.response?.data?.errors?.[0]?.message || err.message;
      log.warn(`Cloudflare 비전 확인 실패, Groq로 폴백: ${msg}`);
    }
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    log.warn(`미디어 확인 불가(GROQ_API_KEY 없음) → 사용 안 함: ${imageUrl}`);
    return false;
  }
  // ponytail: 무료 등급은 분당 입력 7,000토큰(사진 1장 ≈ 2,200) — 분당 3장 남짓. 한도에 걸리면
  // Groq가 알려주는 대기 시간만큼 쉬었다 재시도한다. 하루 발행량이 늘면 유료 등급 검토.
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await askVisionGroq(apiKey, imageUrl, topic);
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message;
      // Groq는 retry-after 헤더(초)를 준다. 없으면 메시지의 "1m30.5s"/"292ms" 형식을 읽는다.
      const wait = err.response?.status === 429 && attempt <= 4
        && (Number(err.response.headers?.['retry-after']) || parseWait(msg));
      if (wait) {
        await new Promise((r) => setTimeout(r, Math.min(wait + 1, 60) * 1000));
        continue;
      }
      log.warn(`미디어 확인 실패 → 사용 안 함: ${msg} (${imageUrl})`);
      return false;
    }
  }
};

const parseWait = (msg) => {
  const m = String(msg).match(/try again in (?:(\d+)m)?([\d.]+)(ms|s)/);
  if (!m) return 0;
  return Math.max(Number(m[1] || 0) * 60 + Number(m[2]) / (m[3] === 'ms' ? 1000 : 1), 0.5);
};

const parseVerdict = (text, imageUrl, topic, source) => {
  const verdict = JSON.parse(text.replace(/<think>[\s\S]*?<\/think>/, '').trim());
  const pass = verdict.korea === true && verdict.topic === true;
  (pass ? log.ok : log.warn)(`미디어 확인 ${pass ? '통과' : '탈락'}[${source}] [${topic}] korea=${verdict.korea} topic=${verdict.topic} — ${verdict.what} (${imageUrl})`);
  return pass;
};

// Workers AI의 llava/moondream은 OpenAI 호환 /ai/v1/chat/completions의 image_url(원격 URL,
// base64 data URI 둘 다)을 받아주지 않는다(실측: 빈 응답 또는 "string not in array,binary"
// 에러) — 네이티브 /ai/run/{model} 엔드포인트에 이미지를 바이트 배열로 직접 보내야 한다.
const askVisionCloudflare = async (apiToken, accountId, imageUrl, topic) => {
  const imgRes = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 });
  const res = await axios.post(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${CF_VISION_MODEL}`,
    {
      image: Array.from(new Uint8Array(imgRes.data)),
      prompt: `${VISION_PROMPT(topic)} Respond with ONLY the JSON object, nothing else.`,
      max_tokens: 400
    },
    { headers: { Authorization: `Bearer ${apiToken}` }, timeout: 60000 }
  );
  const text = res.data?.result?.description || res.data?.result?.response || '';
  return parseVerdict(text, imageUrl, topic, 'cloudflare');
};

const askVisionGroq = async (apiKey, imageUrl, topic) => {
  const res = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
    model: VISION_MODEL,
    max_tokens: 400,
    response_format: { type: 'json_object' },
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: `${VISION_PROMPT(topic)} /no_think` },
        { type: 'image_url', image_url: { url: imageUrl } }
      ]
    }]
  }, { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 60000 });
  const text = res.data?.choices?.[0]?.message?.content || '';
  return parseVerdict(text, imageUrl, topic, 'groq');
};

/** 사진이면 해상도 확인 후 verifyImage, 영상이면 대표 프레임으로 verifyImage(영상 해상도는 수집기가 거른다). */
const verifyMedia = async (url, topic, { isVideo = false } = {}) => {
  if (isVideo) return verifyImage(await videoThumbnail(url), topic);
  // Pexels/Pixabay는 수집기가 API의 원본 너비(2000px 이상)로 이미 걸렀다. 여기 오는 건 축소본(large2x)이라
  // 세로 사진은 원본이 커도 1080px 미만으로 재져 탈락했다(검토 지적) — 원본 너비를 모르는 출처만 잰다.
  if (/pexels\.com|pixabay\.com/.test(url)) return verifyImage(url, topic);
  try {
    const width = await imageWidth(url);
    if (width < MIN_IMAGE_WIDTH) {
      log.warn(`저화질(${width}px < ${MIN_IMAGE_WIDTH}px) → 사용 안 함: ${url}`);
      return false;
    }
  } catch (err) {
    log.warn(`이미지 크기 확인 실패 → 사용 안 함: ${err.message} (${url})`);
    return false;
  }
  return verifyImage(url, topic);
};

module.exports = { mediaKey, isUsed, verifyMedia, verifyImage, videoThumbnail };
