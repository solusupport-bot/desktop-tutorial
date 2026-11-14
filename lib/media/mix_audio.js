const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');
const axios = require('axios');
const log = require('../logger');

const execFileAsync = promisify(execFile);

const downloadToFile = async (url, destPath) => {
  const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000 });
  fs.writeFileSync(destPath, res.data);
};

// 2026-09 리서치 근거: Reels 바이럴 클립의 80%가 자막을 쓴다(무음 시청자 비중이 그만큼
// 높다는 뜻) — 지금까진 배경음악만 입히고 화면에 글자가 없었다. ubuntu-latest 러너와
// macOS 둘 다에서 기본으로 존재하는 폰트만 후보로 둔다 — 못 찾으면 자막 없이 원래
// 동작(음악만 합성)으로 조용히 대체한다.
const FONT_CANDIDATES = [
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
  '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
];
const findSystemFont = () => FONT_CANDIDATES.find((p) => fs.existsSync(p)) || null;

// drawtext는 textfile 안의 콜론/역슬래시까지 필터 그래프 문법으로 해석하는 ffmpeg
// 버전이 있어(실측 확인은 안 했지만 알려진 이슈), 방어적으로 이스케이프한다.
const escapeForDrawtext = (text) => text.replace(/\\/g, '\\\\').replace(/:/g, '\\:');

// 2026-09-24 사용자 요청: Reel 첫 2초 동안 화면 중앙에 "KOREA ❤️🇰🇷" 스티커를 띄운다.
// drawtext는 컬러 이모지(특히 국기 합자)를 못 그려서, 미리 만든 PNG를 overlay한다.
// 하트·태극기 그림은 Twemoji(CC-BY 4.0, github.com/jdecked/twemoji).
const STICKER_PATH = path.join(__dirname, '..', '..', 'assets', 'korea-sticker.png');
const STICKER_SECONDS = 2;
const STICKER_WIDTH_RATIO = 0.6;

const REEL_WIDTH = 1080;
const REEL_HEIGHT = 1920;
const REEL_SCALE_FILTER = `scale=${REEL_WIDTH}:${REEL_HEIGHT}:force_original_aspect_ratio=increase,crop=${REEL_WIDTH}:${REEL_HEIGHT}`;

const getDurationSeconds = async (filePath) => {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath
  ]);
  return parseFloat(stdout.trim());
};

/**
 * 무음 영상(Pexels)과 배경음악(Jamendo)을 합성합니다. GitHub Actions 러너(ubuntu-latest)에는
 * ffmpeg/ffprobe가 기본 설치돼 있어 별도 설치 스텝이 필요 없습니다.
 * 음악이 영상보다 짧으면 반복(-stream_loop)해 채우고, 영상 길이에 맞춰 자른 뒤 마지막
 * 1.5초를 페이드아웃해 뚝 끊기지 않게 합니다.
 * captionLines(배열, 최대 3줄)를 주면 화면에 번인 자막을 입힙니다(2026-09 리서치: 바이럴 Reels의
 * 80%가 자막 사용 — 무음 시청 대응). 자막을 넣으려면 영상 재인코딩이 필요해(-c:v copy
 * 불가) libx264로 전환하고, 시스템에 쓸 폰트가 없으면 자막 없이 원래 동작(재인코딩 없는
 * 음악만 합성)으로 조용히 대체합니다.
 * 2026-10-17 수정: 예전엔 첫 줄(훅)만 3초 떴고 나머지 27초는 정보 없이 음악만 흘렀다
 * ("영상이 허접하다"는 실측 지적) — 이제 줄마다 영상 길이를 균등 분할한 구간에서
 * 순서대로 보여줘 영상 내내 정보(훅→팁→클로저)가 화면에 남는다.
 * 반환값은 합성된 mp4의 로컬 임시 경로입니다 — 업로드 후 cleanupMergedVideo로 정리하세요.
 */
// 2026-09-12: Reel 길이를 15~30초 범위로 강제한다(요청 사항) — Pexels 원본 영상 길이가
// 이 범위 밖이면 짧으면 루프, 길면 잘라서 최종 길이를 이 범위 안에 맞춘다. 자막은
// drawtext가 t=0부터 표시되므로 "처음 3초 내 등장" 요구는 이미 항상 만족한다.
const MIN_REEL_SECONDS = 15;
const MAX_REEL_SECONDS = 30;

const attachMusicToVideo = async (videoUrl, musicUrl, captionLines) => {
  const lines = (Array.isArray(captionLines) ? captionLines : (captionLines ? [captionLines] : []))
    .filter(Boolean);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lik-music-'));
  const videoPath = path.join(tmpDir, 'video.mp4');
  const musicPath = path.join(tmpDir, 'music.mp3');
  const outPath = path.join(tmpDir, 'output.mp4');

  try {
    await downloadToFile(videoUrl, videoPath);
    await downloadToFile(musicUrl, musicPath);

    const videoDuration = await getDurationSeconds(videoPath);
    const needsLoop = videoDuration < MIN_REEL_SECONDS;
    const targetDuration = needsLoop
      ? MIN_REEL_SECONDS
      : Math.min(videoDuration, MAX_REEL_SECONDS);
    const fadeStart = Math.max(0, targetDuration - 1.5);
    const audioFilter = `[1:a]atrim=0:${targetDuration},afade=t=out:st=${fadeStart}:d=1.5[aout]`;

    const fontFile = lines.length ? findSystemFont() : null;
    let filterComplex;
    let videoMap;
    // 2026-09-22: 자막이 없을 때 -c:v copy로 원본 스트림을 그대로 두면 Pexels/Pixabay
    // 원본의 해상도/비트레이트가 그대로 남아 30초짜리가 수십 MB까지 나가고, GitHub
    // Git Data API(git/blobs)가 그 크기에서 "input too large"로 업로드를 거부해
    // 음악 없는 원본으로 조용히 대체되는 문제가 실측됐다(인스타 게시물에 음악이
    // 안 들어감). 자막 유무와 무관하게 항상 재인코딩 + 1080px로 다운스케일해 최종
    // 파일을 항상 몇 MB대로 눌러놓는다.
    // 2026-10-11 사용자 실측 지적(발행된 Reel 스크린샷으로 확인: "KOREA" 텍스트 왼쪽이
    // 잘려 "OREA"로 보임): 원본 Pexels 영상이 orientation:portrait로 검색해도 정확히
    // 9:16이 아닌 경우가 섞여 있다. 영상 비율을 원본 그대로 유지한 채 올리면 Instagram이
    // 피드/릴스 그리드 썸네일을 만들 때 9:16 기준으로 자체 추가 크롭을 하는데, 그 크롭
    // 경계가 중앙 정렬해 둔 스티커를 가로로 베어 버린다. watermark.js의 이미지 portrait
    // 옵션과 동일한 해법 — 업로드 전에 영상 자체를 정확히 1080x1920(9:16)으로 고정
    // 크롭해서 Instagram이 더 이상 자체 크롭을 하지 않게 만든다.
    const scaleFilter = REEL_SCALE_FILTER;
    let videoCodecArgs = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28'];

    if (fontFile) {
      // 2026-09-13 사용자가 실제 발행된 Reel 스크린샷으로 지적: 하단에 두면 Instagram
      // 자체 UI(계정명, 캡션 미리보기, 오디오 정보, 우측 좋아요/댓글/공유 아이콘)가
      // 항상 화면 하단 20~25%를 차지해서 자막과 겹쳐 지저분해진다 — 이 하단 영역은
      // 앱이 그리는 것이라 여백을 아무리 늘려도 근본적으로 피할 수 없다. 상단(앱 헤더
      // 아래, 15% 지점)으로 옮긴다 — Reels 상단 8~10%엔 뒤로가기/제목/추가 버튼만
      // 있어 실제 영상 위 자막을 가리지 않는다.
      // 줄마다 영상 길이를 균등 분할한 시간대에만 보이게 해 영상 내내 정보가 남는다
      // (이전엔 첫 줄만 lt(t,3)으로 3초 뜨고 나머지 시간은 자막이 없었다).
      const segDuration = targetDuration / lines.length;
      let prevLabel = 'vb0';
      filterComplex = `[0:v]${scaleFilter}[${prevLabel}]`;
      lines.forEach((line, i) => {
        const captionPath = path.join(tmpDir, `caption${i}.txt`);
        fs.writeFileSync(captionPath, escapeForDrawtext(line.slice(0, 90)));
        const start = (i * segDuration).toFixed(2);
        const end = (i === lines.length - 1 ? targetDuration : (i + 1) * segDuration).toFixed(2);
        const nextLabel = i === lines.length - 1 ? 'vbase' : `vb${i + 1}`;
        filterComplex += `;[${prevLabel}]drawtext=fontfile=${fontFile}:textfile=${captionPath}:fontsize=42:`
          + `fontcolor=white:box=1:boxcolor=black@0.45:boxborderw=8:x=(w-text_w)/2:y=h*0.15:`
          + `enable='between(t,${start},${end})'[${nextLabel}]`;
        prevLabel = nextLabel;
      });
    } else {
      if (lines.length) log.warn('번인 자막용 폰트를 찾지 못해 자막 없이 합성합니다.');
      filterComplex = `[0:v]${scaleFilter}[vbase]`;
    }
    // scaleFilter가 이제 항상 REEL_WIDTH로 고정 출력하므로 그 값을 그대로 쓴다.
    const stickerWidth = Math.round((REEL_WIDTH * STICKER_WIDTH_RATIO) / 2) * 2;
    filterComplex += `;[2:v]scale=${stickerWidth}:-1[sticker]`
      + `;[vbase][sticker]overlay=(W-w)/2:(H-h)/2:enable='lt(t,${STICKER_SECONDS})'[vout]`
      + `;${audioFilter}`;
    videoMap = '[vout]';

    const videoInputArgs = needsLoop ? ['-stream_loop', '-1', '-i', videoPath] : ['-i', videoPath];

    await execFileAsync('ffmpeg', [
      '-y',
      ...videoInputArgs,
      '-stream_loop', '-1', '-i', musicPath,
      '-i', STICKER_PATH,
      '-filter_complex', filterComplex,
      '-map', videoMap, '-map', '[aout]',
      ...videoCodecArgs, '-c:a', 'aac', '-b:a', '128k',
      '-t', String(targetDuration),
      outPath
    ], { maxBuffer: 1024 * 1024 * 50 });

    log.ok(`영상+음악 합성 완료 (${targetDuration.toFixed(1)}초${fontFile ? ', 자막 포함' : ''})`);
    return outPath;
  } catch (err) {
    log.err(`음악 합성 실패: ${err.message}`);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return null;
  }
};

const MONTAGE_CLIP_SECONDS = 3;

/**
 * 2026-10-18: 아웃라이어 리서치(data/outlier_structure_library.md 카테고리 G) 근거 —
 * 실물 출연 없이 터진 영상은 전부 영상 1개를 늘어뜨린 게 아니라 여러 짧은 장면을 음악
 * 박자에 맞춰 이어붙인 몽타주였고, 자막도 화면 중앙 고정 한 줄(지명/감성 문구)뿐이었다.
 * attachMusicToVideo(정보형, 훅→팁→마무리 다문단 자막)와는 다른 별도 함수로 둔다 —
 * 섞으면 둘 다 어중간해진다. clipUrls는 2개 이상이어야 몽타주 효과가 난다(1개면 그냥
 * attachMusicToVideo를 쓸 것).
 */
const buildAestheticMontage = async (clipUrls, musicUrl, hookLine) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lik-montage-'));
  const musicPath = path.join(tmpDir, 'music.mp3');
  const outPath = path.join(tmpDir, 'output.mp4');

  try {
    const clipPaths = await Promise.all(clipUrls.map(async (url, i) => {
      const dest = path.join(tmpDir, `clip${i}.mp4`);
      await downloadToFile(url, dest);
      return dest;
    }));
    await downloadToFile(musicUrl, musicPath);

    const targetDuration = clipPaths.length * MONTAGE_CLIP_SECONDS;
    const fadeStart = Math.max(0, targetDuration - 1.5);
    const audioFilter = `[${clipPaths.length}:a]atrim=0:${targetDuration},afade=t=out:st=${fadeStart}:d=1.5[aout]`;

    // 각 클립을 같은 길이로 잘라 이어붙인 뒤(concat), 그 위에 한 번만 중앙 고정 훅
    // 텍스트를 올린다 — 카테고리 G 레시피(훅 한 줄 + 장면 전환 + 음악만) 그대로.
    let filterComplex = clipPaths
      .map((_, i) => `[${i}:v]${REEL_SCALE_FILTER},trim=0:${MONTAGE_CLIP_SECONDS},setpts=PTS-STARTPTS[v${i}]`)
      .join(';');
    filterComplex += `;${clipPaths.map((_, i) => `[v${i}]`).join('')}concat=n=${clipPaths.length}:v=1:a=0[vconcat]`;

    const fontFile = hookLine ? findSystemFont() : null;
    if (fontFile) {
      const hookPath = path.join(tmpDir, 'hook.txt');
      fs.writeFileSync(hookPath, escapeForDrawtext(hookLine.slice(0, 60)));
      filterComplex += `;[vconcat]drawtext=fontfile=${fontFile}:textfile=${hookPath}:fontsize=54:`
        + 'fontcolor=white:box=1:boxcolor=black@0.35:boxborderw=10:x=(w-text_w)/2:y=(h-text_h)/2[vout]';
    } else {
      if (hookLine) log.warn('번인 자막용 폰트를 찾지 못해 훅 텍스트 없이 합성합니다.');
      filterComplex += ';[vconcat]copy[vout]';
    }
    filterComplex += `;${audioFilter}`;

    await execFileAsync('ffmpeg', [
      '-y',
      ...clipPaths.flatMap((p) => ['-i', p]),
      '-stream_loop', '-1', '-i', musicPath,
      '-filter_complex', filterComplex,
      '-map', '[vout]', '-map', '[aout]',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-c:a', 'aac', '-b:a', '128k',
      '-t', String(targetDuration),
      outPath
    ], { maxBuffer: 1024 * 1024 * 50 });

    log.ok(`몽타주 합성 완료 (클립 ${clipPaths.length}개, ${targetDuration}초)`);
    return outPath;
  } catch (err) {
    log.err(`몽타주 합성 실패: ${err.message}`);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return null;
  }
};

/**
 * 2026-11-14 사용자 결정: 인스타는 영상만 — 제휴 상품 사진(이미 워터마크된 4:5 세로)을
 * 장당 SLIDE_SECONDS씩 천천히 확대되는 슬라이드 영상으로 만든다. 9:16으로 꽉 채워
 * 자르면 오른쪽 아래 워터마크가 잘리므로, 사진은 통째로 가운데 두고 남는 위아래만
 * 같은 사진을 흐리게 깐다.
 */
const SLIDE_SECONDS = 3;
const SLIDE_FPS = 30;
const buildPhotoSlideshow = async (imageUrls, musicUrl, hookLine) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lik-slides-'));
  const musicPath = path.join(tmpDir, 'music.mp3');
  const outPath = path.join(tmpDir, 'output.mp4');
  try {
    const imagePaths = await Promise.all(imageUrls.map(async (url, i) => {
      const dest = path.join(tmpDir, `slide${i}.jpg`);
      await downloadToFile(url, dest);
      return dest;
    }));
    await downloadToFile(musicUrl, musicPath);

    const frames = SLIDE_SECONDS * SLIDE_FPS;
    const targetDuration = imagePaths.length * SLIDE_SECONDS;
    const fadeStart = Math.max(0, targetDuration - 1.5);
    let filterComplex = imagePaths.map((_, i) =>
      `[${i}:v]split[bg${i}][fg${i}];`
      + `[bg${i}]${REEL_SCALE_FILTER},boxblur=24:2[bgb${i}];`
      + `[fg${i}]scale=${REEL_WIDTH}:-2[fgs${i}];`
      + `[bgb${i}][fgs${i}]overlay=(W-w)/2:(H-h)/2,`
      + `zoompan=z='min(zoom+0.0007,1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${REEL_WIDTH}x${REEL_HEIGHT}:fps=${SLIDE_FPS},`
      + `setsar=1,setpts=PTS-STARTPTS[v${i}]`).join(';');
    filterComplex += `;${imagePaths.map((_, i) => `[v${i}]`).join('')}concat=n=${imagePaths.length}:v=1:a=0[vconcat]`;

    const fontFile = hookLine ? findSystemFont() : null;
    if (fontFile) {
      const hookPath = path.join(tmpDir, 'hook.txt');
      fs.writeFileSync(hookPath, escapeForDrawtext(hookLine.slice(0, 60)));
      filterComplex += `;[vconcat]drawtext=fontfile=${fontFile}:textfile=${hookPath}:fontsize=54:`
        + 'fontcolor=white:box=1:boxcolor=black@0.35:boxborderw=10:x=(w-text_w)/2:y=h*0.12[vout]';
    } else {
      filterComplex += ';[vconcat]copy[vout]';
    }
    filterComplex += `;[${imagePaths.length}:a]atrim=0:${targetDuration},afade=t=out:st=${fadeStart}:d=1.5[aout]`;

    await execFileAsync('ffmpeg', [
      '-y',
      ...imagePaths.flatMap((p) => ['-i', p]), // 사진 1프레임 입력 — zoompan이 장당 d프레임을 만든다
      '-stream_loop', '-1', '-i', musicPath,
      '-filter_complex', filterComplex,
      '-map', '[vout]', '-map', '[aout]',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k',
      '-t', String(targetDuration),
      outPath
    ], { maxBuffer: 1024 * 1024 * 50 });

    log.ok(`사진 슬라이드 영상 합성 완료 (사진 ${imagePaths.length}장, ${targetDuration}초)`);
    return outPath;
  } catch (err) {
    log.err(`사진 슬라이드 영상 합성 실패: ${err.message}`);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return null;
  }
};

const cleanupMergedVideo = (outPath) => {
  try { fs.rmSync(path.dirname(outPath), { recursive: true, force: true }); } catch (err) { /* 정리 실패는 무시 */ }
};

module.exports = { attachMusicToVideo, buildAestheticMontage, buildPhotoSlideshow, cleanupMergedVideo };
