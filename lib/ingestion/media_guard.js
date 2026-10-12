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
 * 판정 근거는 로그로 남긴다.
 */
const verifyImage = async (imageUrl, topic) => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || !imageUrl) {
    log.warn(`미디어 확인 불가(${!apiKey ? 'GROQ_API_KEY 없음' : '이미지 주소 없음'}) → 사용 안 함: ${imageUrl}`);
    return false;
  }
  // ponytail: 무료 등급은 분당 입력 7,000토큰(사진 1장 ≈ 2,200) — 분당 3장 남짓. 한도에 걸리면
  // Groq가 알려주는 대기 시간만큼 쉬었다 재시도한다. 하루 발행량이 늘면 유료 등급 검토.
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await askVision(apiKey, imageUrl, topic);
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message;
      const wait = err.response?.status === 429 && attempt <= 4 && Number((msg.match(/try again in ([\d.]+)s/) || [])[1]);
      if (wait) {
        await new Promise((r) => setTimeout(r, Math.min(wait + 1, 60) * 1000));
        continue;
      }
      log.warn(`미디어 확인 실패 → 사용 안 함: ${msg} (${imageUrl})`);
      return false;
    }
  }
};

const askVision = async (apiKey, imageUrl, topic) => {
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
  const verdict = JSON.parse(text.replace(/<think>[\s\S]*?<\/think>/, '').trim());
  const pass = verdict.korea === true && verdict.topic === true;
  (pass ? log.ok : log.warn)(`미디어 확인 ${pass ? '통과' : '탈락'} [${topic}] korea=${verdict.korea} topic=${verdict.topic} — ${verdict.what} (${imageUrl})`);
  return pass;
};

/** 사진이면 해상도 확인 후 verifyImage, 영상이면 대표 프레임으로 verifyImage(영상 해상도는 수집기가 거른다). */
const verifyMedia = async (url, topic, { isVideo = false } = {}) => {
  if (isVideo) return verifyImage(await videoThumbnail(url), topic);
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
