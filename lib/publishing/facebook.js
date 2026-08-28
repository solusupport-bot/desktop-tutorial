const log = require('../logger');
const { graphPost } = require('./meta_client');

/**
 * 여러 장의 사진을 비공개(published:false)로 업로드해 photo id(media_fbid)만 받아둡니다.
 * 이렇게 얻은 id들을 /feed의 attached_media로 묶으면 사진 여러 장이 한 게시물(앨범)로 올라갑니다.
 */
const uploadUnpublishedPhoto = async (pageId, accessToken, imageUrl) => {
  const res = await graphPost(`/${pageId}/photos`, { url: imageUrl, published: false }, accessToken);
  if (!res.id) throw new Error('사진 업로드 실패(id 없음)');
  return res.id;
};

/**
 * Facebook 페이지에 텍스트/이미지/이미지 앨범/영상 게시글을 발행합니다.
 * FB_PAGE_ACCESS_TOKEN/FB_PAGE_ID가 없으면 모의 발행으로 대체합니다.
 * 우선순위: videoUrl(영상) > imageUrls(2장 이상 = 여러 장 앨범) > imageUrl(단일 사진) > 텍스트만.
 */
const publishToFacebook = async ({ text, imageUrl, imageUrls, videoUrl }) => {
  const accessToken = process.env.FB_PAGE_ACCESS_TOKEN;
  const pageId = process.env.FB_PAGE_ID;
  const images = (imageUrls && imageUrls.length > 0) ? imageUrls : (imageUrl ? [imageUrl] : []);

  if (!accessToken || !pageId) {
    log.warn('FB_PAGE_ACCESS_TOKEN 또는 FB_PAGE_ID가 없습니다. 모의 발행을 수행합니다.');
    log.ok(`[Facebook 모의 발행${videoUrl ? ' / 영상' : images.length > 1 ? ` / 앨범 ${images.length}장` : ''}]\n${text.slice(0, 150)}...`);
    return { id: 'mock_fb_post_id' };
  }

  try {
    let data;
    if (videoUrl) {
      data = await graphPost(`/${pageId}/videos`, { file_url: videoUrl, description: text }, accessToken);
    } else if (images.length > 1) {
      const photoIds = [];
      for (const url of images) {
        photoIds.push(await uploadUnpublishedPhoto(pageId, accessToken, url));
      }
      const attachedMedia = photoIds.map((id) => ({ media_fbid: id }));
      data = await graphPost(`/${pageId}/feed`, {
        message: text,
        attached_media: JSON.stringify(attachedMedia)
      }, accessToken);
    } else if (images.length === 1) {
      data = await graphPost(`/${pageId}/photos`, { url: images[0], caption: text }, accessToken);
    } else {
      data = await graphPost(`/${pageId}/feed`, { message: text }, accessToken);
    }

    log.ok(`Facebook 발행 완료 (Post ID: ${data.id || data.post_id}${videoUrl ? ', 영상' : images.length > 1 ? `, 앨범 ${images.length}장` : ''})`);
    return data;
  } catch (err) {
    log.err(`Facebook 발행 실패: ${err.response?.data?.error?.message || err.message}`);
    return null;
  }
};

module.exports = { publishToFacebook };
