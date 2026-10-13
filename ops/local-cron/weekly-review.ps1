# 2026-10-13 사용자 규칙: 7일간 게시물을 분석해 반응 없는 부분(카피·이미지·영상·게시 시간 등 전부)을
# 고치고 잘된 것을 벤치마킹한다. 성과 수집·리포트 생성까지는 스크립트로, 진단·수정은 Claude 세션이 한다
# (지시: weekly-review-prompt.md). 작업 스케줄러 "DesktopTutorial-WeeklyReview"가 매주 월요일 실행.
$ErrorActionPreference = 'Continue'
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$logFile = Join-Path $PSScriptRoot "weekly-review.log"
function Log($msg) { Add-Content -Path $logFile -Value "$(Get-Date -Format o) $msg" -Encoding utf8 }

# 다른 크론과 같은 저장소를 동시에 커밋하지 않게 같은 뮤텍스를 쓴다.
$mutex = New-Object System.Threading.Mutex($false, "Global\DesktopTutorialQueue")
if (-not $mutex.WaitOne([TimeSpan]::FromMinutes(30))) { Log "SKIP: 다른 작업이 저장소를 쓰는 중"; exit 0 }
try {
    Set-Location $repo
    git pull -q --rebase --autostash origin main 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Log "FAIL: git pull 실패 — 이번 주 리뷰 건너뜀"; exit 1 }

    node scripts/collect-insights.js 2>&1 | Out-Null
    node scripts/weekly-review-report.js 2>&1 | Out-Null
    Log "리포트 생성 완료"

    $claude = Join-Path $env:USERPROFILE ".local\bin\claude.exe"
    $prompt = Get-Content (Join-Path $PSScriptRoot "weekly-review-prompt.md") -Raw -Encoding utf8
    $out = & $claude -p $prompt --permission-mode acceptEdits `
        --allowedTools "Read" "Edit" "Write" "Grep" "Glob" "Bash(node:*)" "Bash(git add:*)" "Bash(git commit:*)" "Bash(git push:*)" "Bash(git diff:*)" "Bash(git status:*)" "Bash(git log:*)" "Bash(git checkout -- :*)" 2>&1 | Out-String
    Add-Content -Path $logFile -Value $out -Encoding utf8
    Log "Claude 리뷰 종료 (exit $LASTEXITCODE)"
} finally {
    $mutex.ReleaseMutex()
}
