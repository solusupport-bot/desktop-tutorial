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

const getVideoWidth = async (filePath) => {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width', '-of', 'csv=p=0', filePath
  ]);
  return parseInt(stdout.trim(), 10);
};

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
 * captionText를 주면 화면 하단에 번인 자막을 입힙니다(2026-09 리서치: 바이럴 Reels의
 * 80%가 자막 사용 — 무음 시청 대응). 자막을 넣으려면 영상 재인코딩이 필요해(-c:v copy
 * 불가) libx264로 전환하고, 시스템에 쓸 폰트가 없으면 자막 없이 원래 동작(재인코딩 없는
 * 음악만 합성)으로 조용히 대체합니다.
 * 반환값은 합성된 mp4의 로컬 임시 경로입니다 — 업로드 후 cleanupMergedVideo로 정리하세요.
 */
// 2026-09-12: Reel 길이를 15~30초 범위로 강제한다(요청 사항) — Pexels 원본 영상 길이가
// 이 범위 밖이면 짧으면 루프, 길면 잘라서 최종 길이를 이 범위 안에 맞춘다. 자막은
// drawtext가 t=0부터 표시되므로 "처음 3초 내 등장" 요구는 이미 항상 만족한다.
const MIN_REEL_SECONDS = 15;
const MAX_REEL_SECONDS = 30;

const attachMusicToVideo = async (videoUrl, musicUrl, captionText) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lik-music-'));
  const videoPath = path.join(tmpDir, 'video.mp4');
  const musicPath = path.join(tmpDir, 'music.mp3');
  const captionPath = path.join(tmpDir, 'caption.txt');
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

    const fontFile = captionText ? findSystemFont() : null;
    let filterComplex;
    let videoMap;
    // 2026-09-22: 자막이 없을 때 -c:v copy로 원본 스트림을 그대로 두면 Pexels/Pixabay
    // 원본의 해상도/비트레이트가 그대로 남아 30초짜리가 수십 MB까지 나가고, GitHub
    // Git Data API(git/blobs)가 그 크기에서 "input too large"로 업로드를 거부해
    // 음악 없는 원본으로 조용히 대체되는 문제가 실측됐다(인스타 게시물에 음악이
    // 안 들어감). 자막 유무와 무관하게 항상 재인코딩 + 1080px로 다운스케일해 최종
    // 파일을 항상 몇 MB대로 눌러놓는다.
    const scaleFilter = "scale='min(1080,iw)':-2";
    let videoCodecArgs = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28'];

    if (fontFile) {
      fs.writeFileSync(captionPath, escapeForDrawtext(captionText.slice(0, 90)));
      // 2026-09-13 사용자가 실제 발행된 Reel 스크린샷으로 지적: 하단에 두면 Instagram
      // 자체 UI(계정명, 캡션 미리보기, 오디오 정보, 우측 좋아요/댓글/공유 아이콘)가
      // 항상 화면 하단 20~25%를 차지해서 자막과 겹쳐 지저분해진다 — 이 하단 영역은
      // 앱이 그리는 것이라 여백을 아무리 늘려도 근본적으로 피할 수 없다. 상단(앱 헤더
      // 아래, 15% 지점)으로 옮긴다 — Reels 상단 8~10%엔 뒤로가기/제목/추가 버튼만
      // 있어 실제 영상 위 자막을 가리지 않는다.
      const drawtext = `[0:v]${scaleFilter},drawtext=fontfile=${fontFile}:textfile=${captionPath}:fontsize=42:`
        + 'fontcolor=white:box=1:boxcolor=black@0.45:boxborderw=8:x=(w-text_w)/2:y=h*0.15:'
        + 'enable=\'lt(t,3)\'[vbase]';
      filterComplex = drawtext;
    } else {
      if (captionText) log.warn('번인 자막용 폰트를 찾지 못해 자막 없이 합성합니다.');
      filterComplex = `[0:v]${scaleFilter}[vbase]`;
    }
    // scaleFilter와 같은 규칙(min(1080, 원본 폭))으로 최종 폭을 구해 스티커 크기를 맞춘다.
    const outWidth = Math.min(1080, await getVideoWidth(videoPath));
    const stickerWidth = Math.round((outWidth * STICKER_WIDTH_RATIO) / 2) * 2;
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

const cleanupMergedVideo = (outPath) => {
  try { fs.rmSync(path.dirname(outPath), { recursive: true, force: true }); } catch (err) { /* 정리 실패는 무시 */ }
};

module.exports = { attachMusicToVideo, cleanupMergedVideo };
