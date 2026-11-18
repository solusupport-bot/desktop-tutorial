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

module.exports = {
  NO_INLINE_LINK_PLATFORMS,
  WATERMARKED_IMAGE_PREFIX,
  applyPlatformLinkRule,
  ensureVideoAttribution,
  isWatermarkedImage,
  profileLinkCta,
  stripInlineUrls,
  videoSourceName
};
