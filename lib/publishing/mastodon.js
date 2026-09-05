const axios = require('axios');
const sharp = require('sharp');
const log = require('../logger');

/**
 * Mastodon(ActivityPub) 발행 모듈.
 *
 * Bluesky와 같은 이유로 추가한 채널이다 — **승인 절차가 없다.** 인스턴스에 가입한 뒤
 * 설정 > 개발(Development) > 새 애플리케이션에서 액세스 토큰을 즉시 발급받으면 끝이고,
 * Meta 앱 심사나 Pinterest Standard 액세스처럼 사람이 검토하는 단계가 아예 없다.
 *
 * Bluesky와의 실질적 차이:
 * - 본문 길이가 넉넉하다(기본 500자, 인스턴스마다 다름 — 그래서 하드코딩하지 않고
 *   /api/v1/instance에서 실제 한도를 읽어온다). Bluesky의 300그래핌보다 여유가 있어
 *   답글 체인 조각 수가 보통 더 적게 나온다.
 * - 연합(federation)되기 때문에 이 계정을 팔로우하지 않는 다른 인스턴스 사용자에게도
 *   해시태그 타임라인을 통해 노출된다 — 해시태그가 Bluesky보다 실제 발견 경로로서
 *   더 크게 작동한다.
 * - Bluesky와 마찬가지로 본문 링크에 도달 페널티가 없다(Threads/Instagram과 다름).
 *
 * 스펙 출처: mastodon/documentation 저장소의 methods/statuses.md, methods/media.md.
 */

const DEFAULT_MAX_CHARS = 500;
// Mastodon 첨부 한도는 게시물당 4개(인스턴스 설정에 따라 다를 수 있으나 기본값 4).
const MAX_IMAGES = 4;
// 인스턴스 기본 이미지 업로드 한도는 보통 8MB지만, 큰 파일은 처리 지연/202를 유발해서
// 넉넉히 아래로 눌러 보낸다.
const MAX_IMAGE_BYTES = 4000000;
const MAX_THREAD_PARTS = 5;

const capParts = (parts, maxParts) => {
  if (parts.length <= maxParts) return parts;
  const head = parts.slice(0, maxParts - 1);
  const tail = parts.slice(maxParts - 1).join('\n\n');
  return [...head, tail];
};

/**
 * threads.js / bluesky.js와 같은 규칙(빈 줄 우선, 없으면 줄바꿈)으로 나누되,
 * 인스턴스의 실제 글자 수 한도를 넘는 조각은 문장 단위로 한 번 더 쪼갠다.
 */
const splitForMastodon = (text, maxChars = DEFAULT_MAX_CHARS, maxParts = MAX_THREAD_PARTS) => {
  const byParagraph = text.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  const base = byParagraph.length > 1
    ? byParagraph
    : text.split(/\n+/).map((p) => p.trim()).filter(Boolean);

  const expanded = [];
  for (const part of (base.length ? base : [text.trim()])) {
    if ([...part].length <= maxChars) {
      expanded.push(part);
      continue;
    }
    const sentences = part.match(/[^.!?]+[.!?]*/g) || [part];
    let buffer = '';
    for (const sentence of sentences) {
      const candidate = buffer ? `${buffer} ${sentence.trim()}` : sentence.trim();
      if ([...candidate].length > maxChars) {
        if (buffer) expanded.push(buffer);
        buffer = sentence.trim();
      } else {
        buffer = candidate;
      }
    }
    if (buffer) expanded.push(buffer);
  }

  return capParts(expanded, maxParts).map((p) => (
    [...p].length > maxChars ? `${[...p].slice(0, maxChars - 1).join('')}…` : p
  ));
};

/**
 * 인스턴스마다 글자 수 한도가 다르다(mastodon.social 500, 어떤 곳은 5000).
 * 500으로 가정하고 자르면 여유 있는 인스턴스에서 굳이 잘게 쪼개게 되고, 반대로
 * 짧은 인스턴스에서는 422가 난다 — 실제 값을 읽어서 쓴다.
 */
const fetchMaxChars = async (instance) => {
  try {
    const res = await axios.get(`${instance}/api/v1/instance`, { timeout: 10000 });
    const max = res.data?.configuration?.statuses?.max_characters;
    return Number.isInteger(max) && max > 0 ? max : DEFAULT_MAX_CHARS;
  } catch (err) {
    log.warn(`[mastodon] 인스턴스 글자 수 한도 조회 실패, 기본값 ${DEFAULT_MAX_CHARS}자를 사용합니다.`);
    return DEFAULT_MAX_CHARS;
  }
};

const uploadImage = async (instance, token, imageUrl, description) => {
  const res = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 20000 });
  let buffer = Buffer.from(res.data);
  let contentType = res.headers['content-type'] || 'image/jpeg';

  if (buffer.length > MAX_IMAGE_BYTES) {
    buffer = await sharp(buffer).resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
    contentType = 'image/jpeg';
  }

  const form = new FormData();
  form.append('file', new Blob([buffer], { type: contentType }), 'image.jpg');
  // description은 대체 텍스트(접근성)다 — Mastodon 커뮤니티는 alt 없는 이미지에
  // 특히 민감해서, 붙이는 편이 도달에도 실제로 유리하다.
  if (description) form.append('description', description);

  const upload = await axios.post(`${instance}/api/v2/media`, form, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 40000,
    maxBodyLength: Infinity
  });

  // 4.0.0부터 이미지는 동기 처리(200)지만, 큰 파일이나 구버전 인스턴스는 202를 주고
  // 백그라운드로 처리한다 — 이때 바로 게시하면 첨부가 빠진 채 올라간다.
  if (upload.status === 202) {
    const id = upload.data.id;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const check = await axios.get(`${instance}/api/v1/media/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000,
        validateStatus: (s) => s === 200 || s === 206
      });
      if (check.status === 200) return id;
    }
    log.warn('[mastodon] 미디어 처리 대기 시간이 초과되어 첨부 없이 진행합니다.');
    return null;
  }

  return upload.data.id;
};

const createStatus = async ({ instance, token, status, mediaIds, inReplyToId }) => {
  const payload = {
    status,
    visibility: 'public',
    language: 'en'
  };
  if (mediaIds && mediaIds.length) payload.media_ids = mediaIds;
  if (inReplyToId) payload.in_reply_to_id = inReplyToId;

  const res = await axios.post(`${instance}/api/v1/statuses`, payload, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      // 같은 내용이 재시도로 두 번 올라가는 걸 서버 쪽에서 막아준다(1시간 보관).
      'Idempotency-Key': `lik-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    },
    timeout: 20000
  });
  return { id: res.data.id, url: res.data.url };
};

/**
 * Mastodon에 발행한다. 첫 조각이 원 게시물, 나머지는 in_reply_to_id로 이어지는
 * 답글 체인이다. 이미지는 첫 게시물에만 붙인다.
 */
const publishToMastodon = async ({ text, imageUrl, imageUrls, blogUrl, topic }) => {
  const instance = (process.env.MASTODON_INSTANCE || '').replace(/\/+$/, '');
  const token = process.env.MASTODON_ACCESS_TOKEN;
  const images = (imageUrls && imageUrls.length > 0) ? imageUrls : (imageUrl ? [imageUrl] : []);

  if (!instance || !token) {
    // reddit.js/bluesky.js와 같은 이유로 throw하지 않는다 — 여기서 예외를 던지면
    // 같은 큐 항목의 나머지 플랫폼 발행까지 통째로 중단된다.
    log.warn('MASTODON_INSTANCE 또는 MASTODON_ACCESS_TOKEN이 없습니다. 모의 발행을 수행합니다.');
    log.ok(`[Mastodon 모의 발행]\n${(text || '').slice(0, 150)}...`);
    return { id: 'mock_mastodon_status_id' };
  }

  const body = blogUrl ? `${text}\n\n📖 ${blogUrl}` : text;

  try {
    const maxChars = await fetchMaxChars(instance);
    const parts = splitForMastodon(body, maxChars);
    const [hook, ...replyParts] = parts;

    const mediaIds = [];
    for (const url of images.slice(0, MAX_IMAGES)) {
      try {
        const id = await uploadImage(instance, token, url, topic ? `${topic} — Land in Korea` : 'Land in Korea travel guide');
        if (id) mediaIds.push(id);
      } catch (err) {
        log.warn(`[mastodon] 이미지 업로드 실패로 건너뜁니다 (${url}): ${err.message}`);
      }
    }

    const root = await createStatus({ instance, token, status: hook, mediaIds });

    let parentId = root.id;
    for (const part of replyParts) {
      const reply = await createStatus({ instance, token, status: part, inReplyToId: parentId });
      parentId = reply.id;
    }

    log.ok(`Mastodon 발행 완료 (${parts.length}조각): ${root.url}`);
    return { id: root.id, url: root.url };
  } catch (err) {
    const detail = err.response?.data?.error || err.message;
    log.err(`Mastodon 발행 실패: ${detail}`);
    return null;
  }
};

module.exports = {
  publishToMastodon,
  // 테스트/검증용 노출
  splitForMastodon,
  fetchMaxChars
};
