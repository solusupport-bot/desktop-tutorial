const { loadQueue, saveQueue } = require('../lib/scheduler/queue');
const {
  applyPlatformLinkRule,
  ensureVideoAttribution,
  isWatermarkedImage,
  videoSourceName
} = require('../lib/scheduler/content_rules');

const queue = loadQueue();
let changed = 0;

for (const item of queue) {
  if (item.status === 'published' || item.status === 'rejected') continue;
  const platform = item.platforms?.[0];
  if (!platform) continue;
  let itemChanged = false;

  let text = applyPlatformLinkRule(platform, item.text, item.topic);
  if (item.videoUrl) text = ensureVideoAttribution(text, item.sourceVideoUrl || item.videoUrl);

  const images = (item.imageUrls || (item.imageUrl ? [item.imageUrl] : []));
  const validImages = images.filter(isWatermarkedImage);
  const usedUnwatermarkedImage = images.length > validImages.length;
  const publishImages = validImages.slice(0, 1);
  const requiresWatermarkedMedia = platform === 'instagram' || platform === 'pinterest';

  if (text !== item.text) {
    item.text = text;
    itemChanged = true;
  }
  if (item.videoUrl && item.sourceVideoUrl) {
    const attribution = videoSourceName(item.sourceVideoUrl);
    if (item.videoAttribution !== attribution) {
      item.videoAttribution = attribution;
      itemChanged = true;
    }
  }
  if (usedUnwatermarkedImage) {
    item.imageUrls = publishImages;
    item.imageUrl = publishImages[0] || null;
    itemChanged = true;
  }
  if (!usedUnwatermarkedImage && validImages.length > 1) {
    item.imageUrls = publishImages;
    item.imageUrl = publishImages[0];
    itemChanged = true;
  }
  if (requiresWatermarkedMedia && !item.videoUrl && validImages.length === 0) {
    const alreadyBlocked = item.status === 'partial'
      && item.retryCount === 3
      && item.results?.[platform]?.error === 'Land in Korea watermarked media required';
    if (!alreadyBlocked) {
      item.status = 'partial';
      item.retryCount = 3;
      item.results[platform] = { error: 'Land in Korea watermarked media required' };
      itemChanged = true;
    }
  }
  if (itemChanged) changed += 1;
}

if (changed > 0) saveQueue(queue);
console.log(`SNS 콘텐츠 규칙 적용: ${changed}건`);
