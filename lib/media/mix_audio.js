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
    const fadeStart = Math.max(0, videoDuration - 1.5);
    const audioFilter = `[1:a]atrim=0:${videoDuration},afade=t=out:st=${fadeStart}:d=1.5[aout]`;

    const fontFile = captionText ? findSystemFont() : null;
    let filterComplex = audioFilter;
    let videoMap = '0:v';
    let videoCodecArgs = ['-c:v', 'copy'];

    if (fontFile) {
      fs.writeFileSync(captionPath, escapeForDrawtext(captionText.slice(0, 90)));
      const drawtext = `[0:v]drawtext=fontfile=${fontFile}:textfile=${captionPath}:fontsize=54:`
        + 'fontcolor=white:box=1:boxcolor=black@0.45:boxborderw=24:x=(w-text_w)/2:y=h-th-140[vout]';
      filterComplex = `${drawtext};${audioFilter}`;
      videoMap = '[vout]';
      videoCodecArgs = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23'];
    } else if (captionText) {
      log.warn('번인 자막용 폰트를 찾지 못해 자막 없이 합성합니다.');
    }

    await execFileAsync('ffmpeg', [
      '-y',
      '-i', videoPath,
      '-stream_loop', '-1', '-i', musicPath,
      '-filter_complex', filterComplex,
      '-map', videoMap, '-map', '[aout]',
      ...videoCodecArgs, '-c:a', 'aac', '-b:a', '128k',
      '-shortest',
      outPath
    ], { maxBuffer: 1024 * 1024 * 50 });

    log.ok(`영상+음악 합성 완료 (${videoDuration.toFixed(1)}초${fontFile ? ', 자막 포함' : ''})`);
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
