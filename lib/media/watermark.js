const path = require('path');
const axios = require('axios');
const sharp = require('sharp');
const log = require('../logger');

/**
 * Meta가 2026년 5월부터 사진/캐로셀에도 "재사용 콘텐츠" 단속을 확대했다 —
 * 컴퓨터 비전으로 구조적 유사성을 잡아내고, "실질적 편집"(내레이션·그래픽 추가) 없이
 * 재사용하면 도달이 줄어든다(30일 10건 이상이면 추천 노출 전체 배제). 워터마크는
 * Meta가 정의하는 "그래픽 추가"에 해당해, 캡션 문구와 별개로 이미지 자체에도
 * "실질적 편집" 신호를 남긴다. 사용자 요청(2026-08-29)으로 도입.
 *
 * assets/logo-mark.png는 사용자가 직접 만든 "Land in Korea" 정식 로고(한옥 대문 아이콘
 * + 로고체 텍스트, 흰색 아웃라인 스티커 스타일)를 그대로 쓴 것 — 배경 투명 PNG를
 * 사용자가 Google Drive에 올려줘서 그걸 받아 트림/압축만 해 고정 에셋으로 저장했다
 * (직접 그린 배지가 아니라 실제 브랜드 로고 그대로). 흰색 아웃라인이 있어서 밝은/어두운
 * 사진 어디에 올려도 따로 배경 박스 없이 잘 보인다. 매 사진마다 하는 작업은 이 고정
 * 이미지를 리사이즈해 합성하는 가벼운 로컬 연산뿐이라 AI 토큰 비용이 들지 않는다.
 */
const LOGO_MARK_PATH = path.join(__dirname, '..', '..', 'assets', 'logo-mark.png');
const LOGO_ASPECT_RATIO = 530 / 700; // assets/logo-mark.png 실제 비율(가로 700 x 세로 530)

// 인스타그램 세로(4:5) 전용 캔버스 — CARD_DESIGN_SPEC.md의 카드뉴스 캔버스와 동일 비율.
const IG_PORTRAIT_WIDTH = 1080;
const IG_PORTRAIT_HEIGHT = 1350;

/**
 * 이미지 URL을 받아 다운로드 -> 우측 하단에 로고를 합성 -> JPEG 버퍼로 반환합니다.
 *
 * 2026-09-13 실측 사고("계속 안 올라가는데 근본적인 대책이 필요하다"): 한국관광공사
 * Odii CDN(ktcdn.co.kr) 사진 한 장이 이 단계에서 다운로드 자체가 실패했는데, 기존
 * 코드는 실패 원인과 무관하게 그냥 null을 반환했고 호출부는 "실패하면 원본 URL
 * 그대로 쓰기"로 폴백했다 — 하지만 다운로드조차 안 되는 URL이라면 나중에 Meta
 * 서버가 발행 시점에 그 URL을 가져올 때도 똑같이 실패할 뿐이다(실제로 그렇게
 * 됨: Threads/Facebook이 "Missing or invalid image file" 등으로 재시도해도 계속
 * 실패). 다운로드 실패와 워터마크 합성(sharp) 실패를 구분해서, 다운로드 자체가
 * 안 되는 이미지는 호출부가 원본을 쓰지 않고 앨범에서 완전히 빼도록 신호를 준다 —
 * 다운로드는 됐지만 합성만 실패한 경우(포맷 이슈 등)는 기존처럼 원본을 그대로 쓴다
 * (그 경우엔 Meta도 원본을 정상적으로 가져올 수 있으므로).
 *
 * 2026-10-08 추가(`portrait` 옵션, 사용자 실측 지적): 원본 가로(landscape) 사진을
 * 그대로 내보내면 Instagram 피드가 4:5~1.91:1 범위 밖인 이미지를 자체적으로
 * 좌우 크롭하는데, 로고(우측 하단 코너)가 그 크롭 경계에 걸려 "Land in Korea"
 * 글자가 중간에 잘려 보이는 문제가 실측됨. Instagram에 쓸 이미지는 업로드 전에
 * 먼저 4:5 세로 캔버스로 크롭(`fit:'cover', position:'attention'` — 사진에서
 * 피사체가 몰린 영역을 보존하는 스마트 크롭)해서 Instagram이 더 이상 자체
 * 크롭을 하지 않게 만든 뒤 로고를 합성한다. Facebook 등 다른 플랫폼은 이
 * 옵션 없이 기존 원본 비율 그대로 호출해 영향 없음(§CLAUDE.md "Facebook = 이미지
 * 앨범 고정" 규칙 유지).
 */
const applyWatermark = async (imageUrl, { portrait = false } = {}) => {
  let raw;
  try {
    const res = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 20000 });
    raw = Buffer.from(res.data);
  } catch (err) {
    log.err(`이미지 다운로드 실패(발행 시점에도 동일하게 실패할 가능성이 높아 앨범에서 제외): ${err.message}`);
    return { buffer: null, downloadFailed: true };
  }

  try {
    let image = sharp(raw);
    if (portrait) {
      image = sharp(await image
        .resize({ width: IG_PORTRAIT_WIDTH, height: IG_PORTRAIT_HEIGHT, fit: 'cover', position: 'attention' })
        .toBuffer());
    }
    const metadata = await image.metadata();

    const logoWidth = Math.round(metadata.width * 0.16);
    const logoHeight = Math.round(logoWidth * LOGO_ASPECT_RATIO);
    const margin = Math.round(metadata.width * 0.02);
    const logoBuffer = await sharp(LOGO_MARK_PATH).resize({ width: logoWidth, height: logoHeight }).toBuffer();

    const buffer = await image
      .composite([{
        input: logoBuffer,
        left: metadata.width - logoWidth - margin,
        top: metadata.height - logoHeight - margin
      }])
      .jpeg({ quality: 90 })
      .toBuffer();

    log.ok(`워터마크 합성 완료 (${metadata.width}x${metadata.height}${portrait ? ', IG 세로 크롭' : ''})`);
    return { buffer, downloadFailed: false };
  } catch (err) {
    log.err(`워터마크 합성 실패(다운로드는 성공, 원본 이미지 그대로 사용): ${err.message}`);
    return { buffer: null, downloadFailed: false };
  }
};

module.exports = { applyWatermark };
