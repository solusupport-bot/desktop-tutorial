const NO_INLINE_LINK_PLATFORMS = new Set(['threads', 'instagram']);
const WATERMARKED_IMAGE_PREFIX = 'https://landinkorea.com/sns-media/images/';

const stripInlineUrls = (text) => String(text || '')
  .replace(/https?:\/\/\S+/gi, '')
  .replace(/[ \t]+\n/g, '\n')
  .replace(/ {2,}/g, ' ')
  .trim();

const profileLinkCta = (topic) => topic
  ? `📖 Open the Land in Korea link in our profile and search “${topic}”.`
  : '📖 Find the full guide through the Land in Korea link in our profile.';

const insertBeforeHashtags = (text, line) => {
  const paragraphs = String(text || '').split('\n\n');
  const hashtagIndex = paragraphs.findIndex((paragraph) => paragraph.trim().startsWith('#'));
  if (hashtagIndex === -1) return `${String(text || '').trim()}\n\n${line}`.trim();
  paragraphs.splice(hashtagIndex, 0, line);
  return paragraphs.join('\n\n').trim();
};

const applyPlatformLinkRule = (platform, text, topic) => {
  if (!NO_INLINE_LINK_PLATFORMS.has(platform)) return String(text || '').trim();

  let cleaned = stripInlineUrls(text)
    .replace(/📖\s*(?:More tips|More on the blog|Full guide).*?(?:link in bio|link in profile)\.?/gi, '')
    .replace(/^📖\s*(?:Full guide|Full breakdown|Full article|More on the blog)\s*:?\s*$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  // Threads는 실제 블로그 URL이 붙는 전용 링크 답글(threads.js의 buildLinkReplyText)이
  // 따로 달린다 — 여기서 링크 없는 "프로필에서 검색하세요" CTA를 본문에 또 넣으면
  // 답글 체인의 제한된 조각 수(MAX_THREAD_PARTS)를 훅/관찰/질문 대신 중복 CTA가
  // 차지해버린다(2026-11-18 실측: 번역이 실패한 글에서 관찰 3개+질문 뒤에 이 CTA가
  // 답글 체인의 마지막 조각을 차지하고, 그 뒤에 실제 링크 답글이 또 달려 CTA가 두 번
  // 겹치는 걸 확인함). Instagram은 답글 링크 메커니즘이 없어 이 인라인 CTA가 유일한
  // 유입 경로이므로 그대로 유지한다.
  if (platform === 'instagram') {
    const cta = profileLinkCta(topic);
    if (!/link in (?:our )?(?:bio|profile)/i.test(cleaned)) {
      cleaned = insertBeforeHashtags(cleaned, cta);
    }
  }
  return cleaned;
};

const videoSourceName = (url) => {
  if (/pexels\.com/i.test(url || '')) return 'Pexels';
  if (/pixabay\.com/i.test(url || '')) return 'Pixabay';
  return null;
};

const ensureVideoAttribution = (text, sourceVideoUrl) => {
  const source = videoSourceName(sourceVideoUrl);
  if (!source || new RegExp(`Video (?:source|credit): ${source}`, 'i').test(text || '')) return text;
  return insertBeforeHashtags(text, `🎬 Video source: ${source}`);
};

const isWatermarkedImage = (url) => typeof url === 'string' && url.startsWith(WATERMARKED_IMAGE_PREFIX);

// 🔗 SNS 링크 = 무조건 landinkorea.com (2026-11-22 사용자 규칙: "랜드인 코리아 홈페이지로
// 연결해야지 왜 다른게 올라가있어 … 다시 반복되지 않도록 해줘 규칙이야").
// 실측 사고: curate.js 프롬프트에 주제 출처 링크(topic_bank.json의 url — 한국관광공사
// english.visitkorea.or.kr/enu/TRP/TP_ENG_1.jsp)가 "Link:"로 들어가 AI가 그걸 "📖 Full guide:"로
// 써버렸고, 번역 단계가 그 URL을 일/중 문단에 그대로 복사해 한 게시물에 외부 링크가 4번 나갔다.
// 또 옛 GitHub Pages 미러(solusupport-bot.github.io/...)로 가는 링크도 발견됐다.
// 발행 직전 모든 플랫폼 본문에 이 함수를 적용한다 — 허용 도메인 외의 URL은 전부 그 글의
// landinkorea.com 블로그 주소(없으면 홈)로 바꾼다. 이 허용 목록에 외부 사이트를 추가하지 말 것.
// creativecommons.org는 배경음악 CC BY 라이선스 표기에 법적으로 필요한 링크라 유지한다.
const ALLOWED_LINK_HOSTS = ['landinkorea.com', 'creativecommons.org'];
const OWN_SITE_HOME = 'https://landinkorea.com';
const URL_PATTERN = /https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'*+,;=%]+/g;

const isAllowedHost = (host) => ALLOWED_LINK_HOSTS
  .some((allowed) => host === allowed || host.endsWith(`.${allowed}`));

const enforceOwnLinks = (text, blogUrl) => {
  const fallback = blogUrl && /^https?:\/\/(?:[^/]+\.)?landinkorea\.com/i.test(blogUrl) ? blogUrl : OWN_SITE_HOME;
  return String(text || '').replace(URL_PATTERN, (match) => {
    const trailing = (match.match(/[.,;:!?'*]+$/) || [''])[0];
    const raw = trailing ? match.slice(0, -trailing.length) : match;
    let parsed;
    try { parsed = new URL(raw); } catch (err) { return `${fallback}${trailing}`; }
    const host = parsed.hostname.toLowerCase();
    if (isAllowedHost(host)) return match;
    // 옛 GitHub Pages 미러의 글 주소는 같은 slug의 운영 도메인 글로 옮긴다.
    const postSlug = parsed.pathname.match(/\/posts\/([^/]+?)(?:\.html)?$/);
    if (host.endsWith('github.io') && postSlug) {
      return `${OWN_SITE_HOME}/posts/${postSlug[1]}.html${parsed.search}${trailing}`;
    }
    return `${fallback}${trailing}`;
  });
};

// 📝 출처 표기(영상·이미지·음원)는 게시물당 한 번만 (2026-11-22 사용자 규칙: "음원출처
// 영상및이미지 출처는 한번만 넣어줘 전부다 넣지말고"). 실측: 번역 단계가 "🎬 Video source"와
// "🎵 ... CC BY-SA" 줄까지 일/중간체/중번체로 옮겨 같은 출처가 4번씩 나갔다.
// 출처 줄(🎬/🎵/🎥/📷/🖼️로 시작)은 종류별로 첫 번째 것(영어 원문)만 남기고, 본문과
// 모든 번역 문단이 끝난 맨 뒤(해시태그 앞)로 한 번만 모은다.
const ATTRIBUTION_LINE = /^\s*(🎬|🎵|🎥|📷|🖼️|🖼)/u;

const dedupeAttribution = (text) => {
  const paragraphs = String(text || '').split(/\n\n+/);
  const kept = new Map();
  const body = [];
  paragraphs.forEach((paragraph) => {
    const lines = paragraph.split('\n');
    const rest = [];
    lines.forEach((line) => {
      const m = line.match(ATTRIBUTION_LINE);
      if (!m) { rest.push(line); return; }
      const kind = m[1].replace('🖼️', '🖼');
      if (!kept.has(kind)) kept.set(kind, line.trim());
    });
    const joined = rest.join('\n').trim();
    if (joined) body.push(joined);
  });
  if (!kept.size) return String(text || '').trim();
  const hashtagIndex = body.findIndex((p) => p.startsWith('#') && !/[^#\w\s]/u.test(p.replace(/#[^\s#]+/g, '')));
  const credits = [...kept.values()];
  if (hashtagIndex === -1) return [...body, ...credits].join('\n\n').trim();
  return [...body.slice(0, hashtagIndex), ...credits, ...body.slice(hashtagIndex)].join('\n\n').trim();
};

module.exports = {
  dedupeAttribution,
  ALLOWED_LINK_HOSTS,
  enforceOwnLinks,
  NO_INLINE_LINK_PLATFORMS,
  WATERMARKED_IMAGE_PREFIX,
  applyPlatformLinkRule,
  ensureVideoAttribution,
  isWatermarkedImage,
  profileLinkCta,
  stripInlineUrls,
  videoSourceName
};
