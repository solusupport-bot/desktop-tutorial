# 2026-10-29: GitHub Actions의 "Scheduled publish"(.github/workflows/scheduled-publish.yml)가
# 생성된 뒤로 단 한 번도 실행되지 않았음을 확인(계정 레벨 Actions 제한 — 저장소 자체
# 권한은 열려 있음). 이 스크립트가 그 역할(초안 1건 release -> 품질검사 -> commit+push)을
# 로컬에서 대신한다. deploy-blog-cloudflare.ps1과 같은 뮤텍스를 공유해 동시 쓰기를 막는다.
#
# 중복 방지: publish_queue.py 자체가 그날 이미 올라간 글 수(content/posts의 date 필드)를
# 세어 하루 한도를 넘기지 않고, 같은 슬러그 파일이 이미 있으면 release를 건너뛴다. 따라서
# 작업 스케줄러가 "놓친 실행을 켜지자마자 따라잡기"로 여러 번 몰아 쏴도 중복 발행되지 않는다.
$ErrorActionPreference = 'Continue'
$blog = "C:\Users\추성준\OneDrive\문서\GitHub\land-in-korea-blog"
$logFile = Join-Path $PSScriptRoot "publish-queue-local.log"

function Log($msg) { Add-Content -Path $logFile -Value "$(Get-Date -Format o) $msg" -Encoding utf8 }
function Run($cmd, $cmdArgs, $cwd) {
    $out = & $cmd @cmdArgs 2>&1 | Out-String
    Add-Content -Path $logFile -Value $out -Encoding utf8
    if ($LASTEXITCODE -ne 0) { throw "$cmd $cmdArgs failed (exit $LASTEXITCODE) in $cwd`n$out" }
}

# deploy-blog-cloudflare.ps1 / run-local.ps1과 동일한 전역 뮤텍스 — 세 작업 중 어느 것도
# land-in-korea-blog 작업 트리를 동시에 건드리지 않게 한다.
$mutex = New-Object System.Threading.Mutex($false, "Global\DesktopTutorialQueue")
if (-not $mutex.WaitOne([TimeSpan]::FromMinutes(20))) { Log "SKIP: 다른 작업이 저장소를 쓰고 있어 건너뜁니다."; exit 0 }

try {
    Push-Location $blog
    try {
        git pull -q --rebase --autostash origin main 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            $pullExit = $LASTEXITCODE
            git rebase --abort 2>&1 | Out-Null
            throw "git pull failed (exit $pullExit) in $blog"
        }
    } finally { Pop-Location }

    $draftsDir = Join-Path $blog "content\drafts"
    $drafts = Get-ChildItem $draftsDir -Filter *.md -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne "README.md" }
    if (-not $drafts -or $drafts.Count -eq 0) {
        Log "queue empty - nothing to do"
        exit 0
    }
    Log "$($drafts.Count) draft(s) queued, attempting to release 1"

    Push-Location "$blog\automation"
    try {
        Run python @('publish_queue.py', '--count', '1') "$blog\automation"
        Run python @('validate.py') "$blog\automation"
    } finally { Pop-Location }

    Push-Location $blog
    try {
        git diff --quiet -- content/ 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Log "nothing released this run (daily cap reached, etc.)"
        } else {
            git add content/ 2>&1 | Out-Null
            if ($LASTEXITCODE -ne 0) { throw "git add failed (exit $LASTEXITCODE)" }
            git commit -q -m "chore: release queued post(s) [local-scheduled]" 2>&1 | Out-Null
            if ($LASTEXITCODE -ne 0) { throw "git commit failed (exit $LASTEXITCODE)" }
            git push -q origin main 2>&1 | Out-Null
            if ($LASTEXITCODE -ne 0) { throw "git push failed (exit $LASTEXITCODE) - remote may have new commits, next run's pull will pick them up" }
            Log "released and pushed"
        }
    } finally { Pop-Location }

    Log "DONE"
} catch {
    Log "FAIL: $_"
    throw
} finally {
    $mutex.ReleaseMutex()
}
