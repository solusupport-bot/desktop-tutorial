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
 * 1.5초를 페이드아웃해 뚝 끊기지 않게 합니다. 원본 영상 스트림은 재인코딩하지 않고
 * 그대로 복사해(-c:v copy) 화질 손실과 처리 시간을 줄입니다.
 * 반환값은 합성된 mp4의 로컬 임시 경로입니다 — 업로드 후 cleanupMergedVideo로 정리하세요.
 */
const attachMusicToVideo = async (videoUrl, musicUrl) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lik-music-'));
  const videoPath = path.join(tmpDir, 'video.mp4');
  const musicPath = path.join(tmpDir, 'music.mp3');
  const outPath = path.join(tmpDir, 'output.mp4');

  try {
    await downloadToFile(videoUrl, videoPath);
    await downloadToFile(musicUrl, musicPath);

    const videoDuration = await getDurationSeconds(videoPath);
    const fadeStart = Math.max(0, videoDuration - 1.5);

    await execFileAsync('ffmpeg', [
      '-y',
      '-i', videoPath,
      '-stream_loop', '-1', '-i', musicPath,
      '-filter_complex', `[1:a]atrim=0:${videoDuration},afade=t=out:st=${fadeStart}:d=1.5[aout]`,
      '-map', '0:v', '-map', '[aout]',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k',
      '-shortest',
      outPath
    ], { maxBuffer: 1024 * 1024 * 50 });

    log.ok(`영상+음악 합성 완료 (${videoDuration.toFixed(1)}초)`);
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
