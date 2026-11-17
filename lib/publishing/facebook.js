const log = require('../logger');
const { graphPost } = require('./meta_client');
const { BLOG_HOME_URL } = require('../ingestion/topic_blog_links');

/**
 * 여러 장의 사진을 비공개(published:false)로 업로드해 photo id(media_fbid)만 받아둡니다.
 * 이렇게 얻은 id들을 /feed의 attached_media로 묶으면 사진 여러 장이 한 게시물(앨범)로 올라갑니다.
 */
const uploadUnpublishedPhoto = async (pageId, accessToken, imageUrl) => {
  const res = await graphPost(`/${pageId}/photos`, { url: imageUrl, published: false }, accessToken);
  if (!res.id) throw new Error('사진 업로드 실패(id 없음)');
  return res.id;
};

// 2026-11-17 사용자 결정: 본문에 링크가 있으면 Meta가 도달을 낮춘다(링크 게시물
// 페널티). 본문은 핵심 정보로 끝내고, 블로그 링크는 발행 직후 첫 댓글로 단다 —
// 같은 FB_PAGE_ACCESS_TOKEN으로 scripts/auto-reply-facebook.js가 이미 댓글을
// 쓰고 있어(확인됨) 별도 권한 설정 없이 바로 된다.
const postFirstComment = async (postId, accessToken, blogUrl) => {
  if (!blogUrl || blogUrl.startsWith(BLOG_HOME_URL)) return;
  try {
    await graphPost(`/${postId}/comments`, { message: `📖 Full guide: ${blogUrl}` }, accessToken);
  } catch (err) {
    log.warn(`Facebook 첫 댓글(블로그 링크) 작성 실패: ${err.response?.data?.error?.message || err.message}`);
  }
};

/**
 * Facebook 페이지에 텍스트/이미지/이미지 앨범/영상 게시글을 발행합니다.
 * FB_PAGE_ACCESS_TOKEN/FB_PAGE_ID가 없으면 모의 발행으로 대체합니다.
 * 우선순위: videoUrl(영상) > imageUrls(2장 이상 = 여러 장 앨범) > imageUrl(단일 사진) > 텍스트만.
 * blogUrl이 있으면(그리고 블로그 홈이 아니면) 발행 직후 첫 댓글로 블로그 링크를 단다.
 */
const publishToFacebook = async ({ text, imageUrl, imageUrls, videoUrl, blogUrl }) => {
  const accessToken = process.env.FB_PAGE_ACCESS_TOKEN;
  const pageId = process.env.FB_PAGE_ID;
  const images = (imageUrls && imageUrls.length > 0) ? imageUrls : (imageUrl ? [imageUrl] : []);

  if (!accessToken || !pageId) {
    log.warn('FB_PAGE_ACCESS_TOKEN 또는 FB_PAGE_ID가 없습니다. 모의 발행을 수행합니다.');
    log.ok(`[Facebook 모의 발행${videoUrl ? ' / 영상' : images.length > 1 ? ` / 앨범 ${images.length}장` : ''}]\n${text.slice(0, 150)}...`);
    if (blogUrl && !blogUrl.startsWith(BLOG_HOME_URL)) {
      log.ok(`[Facebook 모의 첫 댓글] 📖 Full guide: ${blogUrl}`);
    }
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
    await postFirstComment(data.post_id || data.id, accessToken, blogUrl);
    return data;
  } catch (err) {
    log.err(`Facebook 발행 실패: ${err.response?.data?.error?.message || err.message}`);
    return null;
  }
};

module.exports = { publishToFacebook };
