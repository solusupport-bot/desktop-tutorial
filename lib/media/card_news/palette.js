// CARD_DESIGN_SPEC.md §2, §3, §1의 값을 그대로 코드로 옮긴 단일 소스.
// 색·폰트·캔버스 크기를 여기가 아닌 다른 곳에서 새로 정의하지 말 것 — 스펙 문서와
// 코드가 어긋나면 항상 CARD_DESIGN_SPEC.md 쪽을 기준으로 이 파일을 고친다.

const PALETTE = {
  NAVY: '#0B1D3A',
  CORAL: '#FF6B5E',
  GOLD: '#F4B740',
  CREAM: '#FBF3E7',
  BLUE: '#3E7CB1',
  WHITE: '#FFFFFF'
};

// 배경 토큰별 기본 텍스트 컬러 (스펙 §2 "어두운 배경엔 흰색, 밝은 배경엔 NAVY").
const TEXT_ON = {
  NAVY: PALETTE.WHITE,
  CORAL: PALETTE.WHITE,
  BLUE: PALETTE.WHITE,
  GOLD: PALETTE.NAVY,
  CREAM: PALETTE.NAVY
};

const FONTS = {
  HEADLINE: "'Space Grotesk', sans-serif",
  BODY: "'Inter', sans-serif"
};

// 렌더 시점에 네트워크로 받아온다 (Pexels 이미지 다운로드와 동일하게 인터넷 접근 필요).
const GOOGLE_FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;600;700&display=swap';

const CANVAS = { width: 1080, height: 1350 };
const SAFE_MARGIN = 64;
const PAGE_TOTAL = 9;

module.exports = { PALETTE, TEXT_ON, FONTS, GOOGLE_FONTS_URL, CANVAS, SAFE_MARGIN, PAGE_TOTAL };
