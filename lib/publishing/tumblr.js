const axios = require('axios');
const crypto = require('crypto');
const log = require('../logger');

/**
 * Tumblr(NPF — Neue Post Format) 발행 모듈.
 *
 * Bluesky/Mastodon과 같은 이유로 추가한다 — 앱을 등록하고 "Explore API"에서
 * 키를 즉시 발급받으면 끝이라 플랫폼 심사가 없다(Meta 앱 심사나 Pinterest
 * Standard 액세스 승인과 다르다). 다만 인증 방식이 이 파이프라인의 다른 어떤
 * 채널과도 다르다 — Tumblr API v2는 OAuth 1.0a(HMAC-SHA1 서명)만 지원한다.
 * 이 저장소에 OAuth1 라이브러리 의존성이 없어서, 서명을 Node 내장 crypto로
 * 직접 구현한다(RFC 5849 그대로 — 별 게 아니라 문자열 정렬 + HMAC-SHA1 한 줄).
 *
 * Bluesky/Mastodon과의 구조적 차이:
 * - 답글 체인이 아니라 **글자 수 제한이 사실상 없는 단일 게시물**이다. Tumblr
 *   문화는 스레드보다 긴 글/이미지 한 방에 익숙하다 — 문단을 쪼갤 필요가 없다.
 * - 발견 경로가 본문 해시태그가 아니라 **게시물 메타데이터의 tags 필드**다.
 *   Tumblr의 태그 검색은 tags 파라미터만 인덱싱하고 본문 속 "#단어"는 보지
 *   않는다(Pinterest의 설명 텍스트 키워드와 비슷한 역할을 tags가 한다).
 * - 이미지는 업로드 없이 **공개 URL을 NPF media 객체에 그대로 넣을 수 있다**
 *   (media.url 필드) — 이 파이프라인의 이미지가 이미 raw.githubusercontent.com에
 *   공개로 올라가 있으므로 Bluesky/Mastodon처럼 blob 업로드 왕복이 필요 없다.
 *
 * 스펙 출처: tumblr/docs 저장소의 api.md("Create/Reblog a Post (Neue Post
 * Format)" 섹션)와 npf-spec.md(Media Objects, Content Block Type: Text/Image,
 * Inline Format Type: Link).
 */

const API_BASE = 'https://api.tumblr.com/v2';
const USER_AGENT = 'LandInKoreaPublishingBot/1.0 (+https://landinkorea.com)';
const MAX_IMAGES = 4;
const GENERIC_TAGS = ['Korea Travel', 'Seoul Travel', 'Travel Tips'];

// ---- OAuth 1.0a (HMAC-SHA1) 서명 ----
// encodeURIComponent는 !'()*를 이스케이프하지 않는데, OAuth1(RFC 5849)은 이 문자들도
// 퍼센트 인코딩하라고 요구한다 — 그대로 두면 서명이 Tumblr 서버 계산값과 어긋난다.
const percentEncode = (str) => encodeURIComponent(str).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

const buildSignatureBaseString = (method, url, params) => {
  const sorted = Object.keys(params).sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(params[k])}`)
    .join('&');
  return [method.toUpperCase(), percentEncode(url), percentEncode(sorted)].join('&');
};

/**
 * Authorization 헤더를 만든다. 본문을 JSON으로 보낼 때는 body 파라미터를 서명에
 * 포함시키지 않는다 — OAuth1 스펙상 서명 대상 "요청 파라미터"는 쿼리스트링과
 * application/x-www-form-urlencoded 본문만 해당하고, JSON 본문은 대상이 아니다.
 * (여기서 body를 잘못 포함시키면 Tumblr가 계산한 서명과 어긋나 401이 난다.)
 */
const oauth1Header = ({ method, url, consumerKey, consumerSecret, token, tokenSecret }) => {
  const oauthParams = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: token,
    oauth_version: '1.0'
  };
  const baseString = buildSignatureBaseString(method, url, oauthParams);
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
  const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');
  const headerParams = { ...oauthParams, oauth_signature: signature };
  return `OAuth ${Object.keys(headerParams).sort()
    .map((k) => `${percentEncode(k)}="${percentEncode(headerParams[k])}"`)
    .join(', ')}`;
};

/**
 * 문자열 안에서 부분 문자열의 코드포인트(유니코드 문자) 범위를 찾는다. NPF의
 * formatting.start/end는 UTF-16 코드유닛이 아니라 **유니코드 코드포인트** 기준이다
 * (npf-spec.md: "🌳는 한 글자로 센다"). JS의 String.indexOf/length는 UTF-16이라,
 * 앞쪽에 이모지나 서로게이트 쌍 문자가 하나만 있어도 그대로 쓰면 범위가 밀린다.
 * Array.from은 코드포인트 단위로 순회하므로 이걸로 변환한다.
 */
const codePointRange = (text, substring) => {
  const utf16Start = text.indexOf(substring);
  if (utf16Start === -1) return null;
  const start = Array.from(text.slice(0, utf16Start)).length;
  const end = start + Array.from(substring).length;
  return { start, end };
};

/**
 * 캡션을 NPF 콘텐츠 블록 배열로 변환한다. Tumblr는 답글 체인이 필요 없으므로
 * (글자 수 제한이 사실상 없음) 문단마다 별도 text 블록으로 나눠 넣는다 — 이렇게
 * 하면 Tumblr 에디터에서 문단 사이 여백이 그대로 유지된다(하나의 text 블록에
 * \n\n을 넣으면 줄바꿈이 아니라 리터럴 문자로 렌더링될 수 있다).
 */
const buildContent = (text, blogUrl, imageUrls = []) => {
  const paragraphs = text.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  const blocks = paragraphs.length ? paragraphs.map((p) => ({ type: 'text', text: p })) : [{ type: 'text', text }];

  imageUrls.slice(0, MAX_IMAGES).forEach((url) => {
    blocks.push({ type: 'image', media: [{ type: 'image/jpeg', url }] });
  });

  if (blogUrl) {
    const linkText = `Full guide: ${blogUrl}`;
    const range = codePointRange(linkText, blogUrl);
    blocks.push({
      type: 'text',
      text: linkText,
      ...(range ? { formatting: [{ start: range.start, end: range.end, type: 'link', url: blogUrl }] } : {})
    });
  }

  return blocks;
};

// Tumblr의 발견 경로는 본문 해시태그가 아니라 게시물의 tags 필드다 — 너무 많이
// 넣으면 스팸으로 보여 오히려 손해라, 구체적인 태그(주제) 하나 + 범용 태그
// 소수로 제한한다(Tumblr 자체 권장: 태그 5개 안팎이 실효 범위).
const buildTags = (topic) => [...new Set([topic, ...GENERIC_TAGS].filter(Boolean))].slice(0, 5);

const createPost = async ({ blogIdentifier, consumerKey, consumerSecret, token, tokenSecret, content, tags }) => {
  const url = `${API_BASE}/blog/${encodeURIComponent(blogIdentifier)}/posts`;
  const body = { content, state: 'published' };
  if (tags && tags.length) body.tags = tags.join(',');

  const authHeader = oauth1Header({ method: 'POST', url, consumerKey, consumerSecret, token, tokenSecret });
  const res = await axios.post(url, body, {
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT
    },
    timeout: 20000
  });
  return res.data.response;
};

/**
 * Tumblr에 발행한다. 답글 체인 없이 단일 게시물로, 문단은 각각 text 블록,
 * 이미지는 image 블록(공개 URL 그대로), 블로그 링크는 마지막 텍스트 블록에
 * 인라인 링크로 붙는다.
 */
const publishToTumblr = async ({ text, imageUrl, imageUrls, blogUrl, topic }) => {
  const consumerKey = process.env.TUMBLR_CONSUMER_KEY;
  const consumerSecret = process.env.TUMBLR_CONSUMER_SECRET;
  const token = process.env.TUMBLR_TOKEN;
  const tokenSecret = process.env.TUMBLR_TOKEN_SECRET;
  const blogIdentifier = process.env.TUMBLR_BLOG_IDENTIFIER;
  const images = (imageUrls && imageUrls.length > 0) ? imageUrls : (imageUrl ? [imageUrl] : []);

  if (!consumerKey || !consumerSecret || !token || !tokenSecret || !blogIdentifier) {
    // reddit.js/bluesky.js/mastodon.js와 같은 이유로 throw하지 않는다 — 여기서
    // 예외를 던지면 같은 큐 항목의 나머지 플랫폼 발행까지 통째로 중단된다.
    log.warn('Tumblr 자격증명(4개 키 + 블로그 식별자) 중 일부가 없습니다. 모의 발행을 수행합니다.');
    log.ok(`[Tumblr 모의 발행]\n${(text || '').slice(0, 150)}...`);
    return { id: 'mock_tumblr_post_id' };
  }

  const content = buildContent(text, blogUrl, images);
  const tags = buildTags(topic);

  try {
    const response = await createPost({ blogIdentifier, consumerKey, consumerSecret, token, tokenSecret, content, tags });
    const id = response.id || response.id_string;
    const url = `https://${blogIdentifier.includes('.') ? blogIdentifier : `${blogIdentifier}.tumblr.com`}/post/${id}`;
    log.ok(`Tumblr 발행 완료: ${url}`);
    return { id, url };
  } catch (err) {
    const detail = err.response?.data?.meta?.msg || err.response?.data?.errors?.[0]?.detail || err.message;
    log.err(`Tumblr 발행 실패: ${detail}`);
    return null;
  }
};

module.exports = {
  publishToTumblr,
  // 테스트/검증용 노출
  buildContent,
  buildTags,
  codePointRange,
  oauth1Header
};
