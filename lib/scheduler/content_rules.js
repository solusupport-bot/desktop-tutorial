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
  const cta = profileLinkCta(topic);
  if (!/link in (?:our )?(?:bio|profile)/i.test(cleaned)) {
    cleaned = platform === 'instagram' ? insertBeforeHashtags(cleaned, cta) : `${cleaned}\n\n${cta}`.trim();
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
