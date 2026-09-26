const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { SLIDE_FILENAMES } = require('./slides');
const { CANVAS } = require('./palette');

// 렌더가 조용히 깨진 채로(예: 스크린샷 도중 브라우저가 죽어 절반만 그려진 PNG,
// 혹은 캔버스 크기가 틀어진 PNG) 업로드/발행까지 흘러가는 걸 막기 위한 구조적
// 검증 — scripts/verify-topic-media-alignment.js/verify-no-duplicate-media.js와
// 같은 "발행 전 하드 게이트" 철학이지만, 이건 텍스트-이미지 정합성이 아니라
// 렌더링 결과물 자체의 무결성(파일 9개, 정확한 이름, 정확한 캔버스 크기)을 본다.
const MIN_FILE_BYTES = 5 * 1024; // 이보다 작으면 거의 확실히 빈 화면/렌더 실패

/**
 * 카드뉴스 렌더링 결과 폴더 하나를 검증한다.
 * 반환: { ok: boolean, problems: string[] }
 */
const verifyCardNewsSet = async (dir) => {
  const problems = [];

  if (!fs.existsSync(dir)) {
    return { ok: false, problems: [`폴더가 없습니다: ${dir}`] };
  }

  const actualFiles = new Set(fs.readdirSync(dir).filter((f) => f.endsWith('.png')));

  SLIDE_FILENAMES.forEach((expected) => {
    if (!actualFiles.has(expected)) {
      problems.push(`파일 누락: ${expected}`);
    }
  });

  const unexpected = [...actualFiles].filter((f) => !SLIDE_FILENAMES.includes(f));
  if (unexpected.length > 0) {
    problems.push(`예상치 못한 PNG 파일(캐로셀에 섞여 들어가면 안 됨): ${unexpected.join(', ')}`);
  }

  for (const filename of SLIDE_FILENAMES) {
    if (!actualFiles.has(filename)) continue; // 이미 누락으로 기록함
    const filePath = path.join(dir, filename);

    const stat = fs.statSync(filePath);
    if (stat.size < MIN_FILE_BYTES) {
      problems.push(`${filename}: 파일 크기가 ${stat.size}바이트뿐 — 빈 화면으로 렌더됐을 가능성.`);
      continue;
    }

    try {
      const metadata = await sharp(filePath).metadata();
      if (metadata.width !== CANVAS.width || metadata.height !== CANVAS.height) {
        problems.push(`${filename}: 캔버스 크기가 ${metadata.width}x${metadata.height} (기대값 ${CANVAS.width}x${CANVAS.height}) — CARD_DESIGN_SPEC.md §1 위반.`);
      }
    } catch (err) {
      problems.push(`${filename}: 이미지로 읽을 수 없음(손상된 PNG) — ${err.message}`);
    }
  }

  return { ok: problems.length === 0, problems };
};

module.exports = { verifyCardNewsSet, MIN_FILE_BYTES };
