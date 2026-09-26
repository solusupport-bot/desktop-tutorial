const { PAGE_TOTAL } = require('./palette');

// verify.js가 렌더링 결과 폴더를 검증할 때 이 목록과 정확히 일치하는지 확인한다 —
// 파일명을 두 곳에 따로 적어두면 언젠가 한쪽만 바뀌어 어긋난다.
const SLIDE_FILENAMES = [
  '01-cover.png', '02-context.png', '03-tip1.png', '04-photo.png', '05-tip2.png',
  '06-tip3.png', '07-photo.png', '08-caution.png', '09-cta.png'
];

const REQUIRED_KEYS = [
  'topicLabel', 'hook', 'coverImage',
  'context',
  'tip1', 'photo1', 'tip2', 'tip3', 'photo2',
  'caution', 'closing'
];

/**
 * CARD_DESIGN_SPEC.md §4의 9슬라이드 표를 코드로 고정한 것.
 * 배경 색·슬라이드 순서·사진 위치는 여기서 하드코딩하고, 호출부(콘텐츠 준비 단계)는
 * 텍스트/이미지만 채운다 — 슬라이드마다 배경을 자유롭게 고를 수 있게 하면 스펙의
 * "연속된 두 슬라이드가 같은 색이면 안 된다" 규칙이 쉽게 깨지기 때문에 아예 선택지를
 * 주지 않는다.
 *
 * content 형태:
 * {
 *   topicLabel: '주제명 (커버 슬라이드용 짧은 라벨)',
 *   hook: '커버 헤드라인 (1~2문장)',
 *   coverImage: 'https://... 또는 로컬 경로',
 *   context: '슬라이드2 본문 (1~2문장, 사실 기반)',
 *   tip1: { title, body },
 *   photo1: { image, caption },
 *   tip2: { title, body },
 *   tip3: { title, body },
 *   photo2: { image, caption },
 *   caution: { title, body },
 *   closing: { headline, body }
 * }
 */
const buildSlideDescriptors = (content) => {
  const missing = REQUIRED_KEYS.filter((key) => content[key] === undefined || content[key] === null);
  if (missing.length > 0) {
    throw new Error(`카드뉴스 콘텐츠에 다음 항목이 없습니다: ${missing.join(', ')}`);
  }

  const [
    coverFile, contextFile, tip1File, photo1File, tip2File, tip3File, photo2File, cautionFile, ctaFile
  ] = SLIDE_FILENAMES;

  const slides = [
    { filename: coverFile, page: 1, type: 'cover', topicLabel: content.topicLabel, hook: content.hook, image: content.coverImage },
    { filename: contextFile, page: 2, type: 'text', background: 'CREAM', body: content.context },
    { filename: tip1File, page: 3, type: 'tip', background: 'GOLD', number: '01', title: content.tip1.title, body: content.tip1.body },
    { filename: photo1File, page: 4, type: 'photo', image: content.photo1.image, caption: content.photo1.caption },
    { filename: tip2File, page: 5, type: 'tip', background: 'BLUE', number: '02', title: content.tip2.title, body: content.tip2.body },
    { filename: tip3File, page: 6, type: 'tip', background: 'GOLD', number: '03', title: content.tip3.title, body: content.tip3.body },
    { filename: photo2File, page: 7, type: 'photo', image: content.photo2.image, caption: content.photo2.caption },
    { filename: cautionFile, page: 8, type: 'caution', background: 'CORAL', title: content.caution.title, body: content.caution.body },
    { filename: ctaFile, page: 9, type: 'closing', headline: content.closing.headline, body: content.closing.body }
  ];

  if (slides.length !== PAGE_TOTAL) {
    throw new Error(`슬라이드 개수가 ${PAGE_TOTAL}장이 아닙니다 (${slides.length}장) — CARD_DESIGN_SPEC.md 위반.`);
  }
  const photoCount = slides.filter((s) => s.type === 'cover' || s.type === 'photo').length;
  if (photoCount !== 3) {
    throw new Error(`사진 슬라이드가 3장이 아닙니다 (${photoCount}장) — CARD_DESIGN_SPEC.md §1/§4 위반.`);
  }

  return slides;
};

module.exports = { buildSlideDescriptors, SLIDE_FILENAMES };
