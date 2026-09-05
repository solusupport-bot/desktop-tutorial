const axios = require('axios');
const sharp = require('sharp');
const log = require('../logger');

/**
 * Bluesky(AT Protocol) 발행 모듈.
 *
 * 이 파이프라인의 다른 채널과 근본적으로 다른 점 두 가지 때문에 별도 모듈로 둔다:
 *
 * 1) **승인 절차가 없다.** Threads/Instagram(Meta 앱 심사)이나 Pinterest(Standard
 *    액세스 승인)와 달리, 앱 비밀번호(App Password)만 발급하면 바로 쓸 수 있다.
 *    사람이 심사를 기다리는 동안 막히는 구간이 없는 유일한 채널이다.
 * 2) **본문 링크에 도달 페널티가 없다.** Threads는 본문에 URL을 넣으면 도달이
 *    억제돼서(scripts/daily-auto-post.js 주석 참고) "링크는 bio에"로 우회하고 있고,
 *    Instagram도 마찬가지다. Bluesky는 링크를 정상 사용으로 취급하므로 Pinterest처럼
 *    글 주소를 본문에 그대로 넣는다 — 대신 Pinterest의 구조화된 link 필드와 달리
 *    여기서는 facet(리치텍스트 주석)으로 클릭 가능하게 만들어야 한다.
 *
 * 스펙 출처: bluesky-social/atproto 저장소의 lexicon 정의
 * (app.bsky.feed.post, app.bsky.richtext.facet, app.bsky.embed.images).
 */

const DEFAULT_SERVICE = 'https://bsky.social';

// app.bsky.feed.post 레코드의 text 한도: 3000바이트 / 300그래핌. 실질 제약은
// 그래핌 쪽이므로(영문 300자면 바이트는 300 근처) 그래핌 기준으로 자른다.
const MAX_GRAPHEMES = 300;

// app.bsky.embed.images는 최대 4장, 각 blob 2,000,000바이트 이하.
const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 2000000;

// Threads와 동일하게 훅 1개 + 답글 최대 4개 = 5조각. Threads는 캡션 길이가 넉넉해서
// 문단을 나누는 게 "체류시간을 늘리는 연출"이지만, Bluesky는 300그래핌 제한 때문에
// 나누는 게 사실상 필수다 — 같은 캡션을 그대로 쓰면 뒤가 잘려 나간다.
const MAX_THREAD_PARTS = 5;

const countGraphemes = (text) => {
  // Node 22의 Intl.Segmenter는 이모지·한글 조합 문자를 사람이 세는 것과 같은 방식으로
  // 센다. text.length(UTF-16 코드유닛)로 세면 이모지 하나가 2로 잡혀서, 실제로는
  // 한도 안에 들어가는 게시물이 잘리거나 반대로 넘긴 채 400 에러가 난다.
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const seg = new Intl.Segmenter('en', { granularity: 'grapheme' });
    let n = 0;
    for (const _ of seg.segment(text)) n += 1;
    return n;
  }
  return [...text].length;
};

const truncateToGraphemes = (text, max) => {
  if (countGraphemes(text) <= max) return text;
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const seg = new Intl.Segmenter('en', { granularity: 'grapheme' });
    const out = [];
    for (const { segment } of seg.segment(text)) {
      if (out.length >= max - 1) break;
      out.push(segment);
    }
    return `${out.join('')}…`;
  }
  return `${[...text].slice(0, max - 1).join('')}…`;
};

/**
 * 리치텍스트 facet 생성 — URL과 해시태그를 클릭 가능하게 만든다.
 *
 * byteSlice의 인덱스는 **UTF-8 바이트 오프셋**이다. 자바스크립트 문자열 인덱스는
 * UTF-16이라 그대로 넣으면 안 된다 — 한글이나 이모지가 앞에 하나만 있어도 오프셋이
 * 밀려서 링크 범위가 엉뚱한 글자에 걸린다(lexicon의 byteSlice 설명이 이 함정을
 * 명시적으로 경고한다). Buffer.byteLength로 앞부분 길이를 재서 변환한다.
 */
const buildFacets = (text) => {
  const facets = [];

  const urlPattern = /https?:\/\/[^\s<>()[\]{}"']+[^\s<>()[\]{}"'.,;:!?]/g;
  let match = urlPattern.exec(text);
  while (match) {
    facets.push({
      index: {
        byteStart: Buffer.byteLength(text.slice(0, match.index), 'utf8'),
        byteEnd: Buffer.byteLength(text.slice(0, match.index + match[0].length), 'utf8')
      },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri: match[0] }]
    });
    match = urlPattern.exec(text);
  }

  // 해시태그는 앞에 공백이나 줄바꿈이 와야 태그로 인정한다 — URL 안의 '#fragment'가
  // 태그로 잘못 잡히는 걸 막기 위한 것.
  const tagPattern = /(^|[\s])(#[^\s#.,;:!?]+)/g;
  match = tagPattern.exec(text);
  while (match) {
    const tagStart = match.index + match[1].length;
    const raw = match[2];
    facets.push({
      index: {
        byteStart: Buffer.byteLength(text.slice(0, tagStart), 'utf8'),
        byteEnd: Buffer.byteLength(text.slice(0, tagStart + raw.length), 'utf8')
      },
      // facet의 tag 값은 '#'을 뺀 순수 태그명이어야 한다(lexicon 명시).
      features: [{ $type: 'app.bsky.richtext.facet#tag', tag: raw.slice(1) }]
    });
    match = tagPattern.exec(text);
  }

  return facets;
};

const capParts = (parts, maxParts) => {
  if (parts.length <= maxParts) return parts;
  const head = parts.slice(0, maxParts - 1);
  const tail = parts.slice(maxParts - 1).join('\n\n');
  return [...head, tail];
};

/**
 * 본문을 답글 체인 조각으로 나눈다. threads.js의 splitIntoThreadParts와 같은 규칙
 * (빈 줄 우선, 없으면 줄바꿈)을 쓰되, Bluesky는 조각마다 300그래핌 하드 리밋이 있어서
 * 나눈 뒤에도 넘치는 조각은 문장 단위로 한 번 더 쪼갠다. 그래도 안 맞으면 자른다.
 */
const splitForBluesky = (text, maxParts = MAX_THREAD_PARTS) => {
  const byParagraph = text.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  const base = byParagraph.length > 1
    ? byParagraph
    : text.split(/\n+/).map((p) => p.trim()).filter(Boolean);

  const expanded = [];
  for (const part of (base.length ? base : [text.trim()])) {
    if (countGraphemes(part) <= MAX_GRAPHEMES) {
      expanded.push(part);
      continue;
    }
    // 한 문단이 300그래핌을 넘으면 문장 단위로 다시 묶는다.
    const sentences = part.match(/[^.!?]+[.!?]*/g) || [part];
    let buffer = '';
    for (const sentence of sentences) {
      const candidate = buffer ? `${buffer} ${sentence.trim()}` : sentence.trim();
      if (countGraphemes(candidate) > MAX_GRAPHEMES) {
        if (buffer) expanded.push(buffer);
        buffer = sentence.trim();
      } else {
        buffer = candidate;
      }
    }
    if (buffer) expanded.push(buffer);
  }

  return capParts(expanded, maxParts).map((p) => truncateToGraphemes(p, MAX_GRAPHEMES));
};

const createSession = async (service, identifier, password) => {
  const res = await axios.post(
    `${service}/xrpc/com.atproto.server.createSession`,
    { identifier, password },
    { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
  );
  return { accessJwt: res.data.accessJwt, did: res.data.did, handle: res.data.handle };
};

/**
 * 이미지 URL을 받아 blob으로 업로드하고 blob 레퍼런스를 돌려준다.
 * 2MB를 넘으면 sharp로 다시 인코딩해 줄인다 — 이 파이프라인의 워터마크 이미지는
 * raw.githubusercontent.com에 원본 크기로 올라가 있어서 실제로 넘길 수 있다.
 */
const uploadImage = async (service, accessJwt, imageUrl) => {
  const res = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 20000 });
  let buffer = Buffer.from(res.data);
  let contentType = res.headers['content-type'] || 'image/jpeg';

  if (buffer.length > MAX_IMAGE_BYTES) {
    log.warn(`[bluesky] 이미지가 ${Math.round(buffer.length / 1024)}KB로 한도를 넘어 재인코딩합니다.`);
    buffer = await sharp(buffer).resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
    contentType = 'image/jpeg';
    if (buffer.length > MAX_IMAGE_BYTES) {
      buffer = await sharp(buffer).resize({ width: 1200, withoutEnlargement: true }).jpeg({ quality: 70 }).toBuffer();
    }
  }

  const upload = await axios.post(`${service}/xrpc/com.atproto.repo.uploadBlob`, buffer, {
    headers: { Authorization: `Bearer ${accessJwt}`, 'Content-Type': contentType },
    timeout: 30000,
    maxBodyLength: Infinity
  });
  return upload.data.blob;
};

const createPost = async ({ service, accessJwt, did, text, embed, reply }) => {
  const record = {
    $type: 'app.bsky.feed.post',
    text,
    createdAt: new Date().toISOString(),
    langs: ['en']
  };
  const facets = buildFacets(text);
  if (facets.length) record.facets = facets;
  if (embed) record.embed = embed;
  if (reply) record.reply = reply;

  const res = await axios.post(
    `${service}/xrpc/com.atproto.repo.createRecord`,
    { repo: did, collection: 'app.bsky.feed.post', record },
    { headers: { Authorization: `Bearer ${accessJwt}`, 'Content-Type': 'application/json' }, timeout: 20000 }
  );
  return { uri: res.data.uri, cid: res.data.cid };
};

/**
 * Bluesky에 발행한다. 훅(첫 문단)이 원 게시물이 되고 나머지는 답글 체인으로 이어진다.
 * 이미지는 첫 게시물에만 붙인다 — 답글마다 같은 이미지를 반복하면 타임라인에서
 * 같은 사진이 5번 뜨는 꼴이 된다.
 */
const publishToBluesky = async ({ text, imageUrl, imageUrls, blogUrl, topic }) => {
  const service = process.env.BLUESKY_SERVICE || DEFAULT_SERVICE;
  const identifier = process.env.BLUESKY_IDENTIFIER;
  const password = process.env.BLUESKY_APP_PASSWORD;
  const images = (imageUrls && imageUrls.length > 0) ? imageUrls : (imageUrl ? [imageUrl] : []);

  if (!identifier || !password) {
    // reddit.js와 같은 이유로 throw하지 않는다 — 여기서 예외를 던지면 같은 큐 항목의
    // 나머지 플랫폼 발행까지 통째로 중단된다.
    log.warn('BLUESKY_IDENTIFIER 또는 BLUESKY_APP_PASSWORD가 없습니다. 모의 발행을 수행합니다.');
    log.ok(`[Bluesky 모의 발행]\n${(text || '').slice(0, 150)}...`);
    return { id: 'mock_bluesky_post_uri' };
  }

  const body = blogUrl ? `${text}\n\n📖 ${blogUrl}` : text;
  const parts = splitForBluesky(body);
  const [hook, ...replyParts] = parts;

  try {
    const { accessJwt, did, handle } = await createSession(service, identifier, password);

    let embed = null;
    if (images.length > 0) {
      const uploaded = [];
      for (const url of images.slice(0, MAX_IMAGES)) {
        try {
          const blob = await uploadImage(service, accessJwt, url);
          // alt는 lexicon상 필수다 — 접근성 목적이기도 하고, 비우면 검증에서 막힌다.
          uploaded.push({ image: blob, alt: topic ? `${topic} — Land in Korea` : 'Land in Korea travel guide' });
        } catch (err) {
          log.warn(`[bluesky] 이미지 업로드 실패로 건너뜁니다 (${url}): ${err.message}`);
        }
      }
      if (uploaded.length) embed = { $type: 'app.bsky.embed.images', images: uploaded };
    }

    const root = await createPost({ service, accessJwt, did, text: hook, embed });

    let parent = root;
    for (const part of replyParts) {
      // root는 항상 첫 게시물, parent는 직전 게시물 — 이래야 앱에서 하나의 스레드로
      // 이어지고, parent만 바꾸면 답글이 평평하게 흩어진다.
      parent = await createPost({
        service,
        accessJwt,
        did,
        text: part,
        reply: { root: { uri: root.uri, cid: root.cid }, parent: { uri: parent.uri, cid: parent.cid } }
      });
    }

    // at:// URI의 마지막 세그먼트(rkey)가 웹 URL의 포스트 ID다.
    const rkey = root.uri.split('/').pop();
    const url = `https://bsky.app/profile/${handle}/post/${rkey}`;
    log.ok(`Bluesky 발행 완료 (${parts.length}조각): ${url}`);
    return { id: root.uri, url };
  } catch (err) {
    const detail = err.response?.data?.message || err.response?.data?.error || err.message;
    log.err(`Bluesky 발행 실패: ${detail}`);
    return null;
  }
};

module.exports = {
  publishToBluesky,
  // 테스트/검증용 노출
  buildFacets,
  splitForBluesky,
  countGraphemes
};
