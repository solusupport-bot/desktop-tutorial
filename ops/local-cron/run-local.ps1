# 2026-09-24 solusupport-bot 계정의 GitHub Actions가 정지돼("Actions has been disabled for this user")
# scheduler.yml / daily-topic.yml이 더 이상 돌지 않는다. 같은 스크립트를 이 PC에서 직접 실행한다.
#   -Mode publish : 15분마다 (작업 스케줄러 DesktopTutorial-SchedulerDispatch) — claim -> 발행
#   -Mode daily   : 매일 09:07 (작업 스케줄러 DesktopTutorial-DailyTopic) — 주제 보충 -> 오늘 글 큐 등록
# 토큰은 저장소 루트 .env에서 읽는다(dotenv). 블로그 발행(sync-blog-posts.js)은 BLOG_REPO_PAT이 없어 여기서 돌리지 않는다.
param([ValidateSet('publish', 'daily')][string]$Mode = 'publish')

$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$logFile = Join-Path $PSScriptRoot "run-local.log"
function Log($msg) { Add-Content -Path $logFile -Value "$(Get-Date -Format o) [$Mode] $msg" -Encoding utf8 }

# 15분 실행과 daily 실행이 겹치면 같은 queue.json을 동시에 쓰게 된다 — 한 번에 하나만.
$mutex = New-Object System.Threading.Mutex($false, "Global\DesktopTutorialQueue")
if (-not $mutex.WaitOne([TimeSpan]::FromMinutes(20))) { Log "SKIP: 이전 실행이 아직 진행 중"; exit 0 }

try {
    Set-Location $repo
    $env:PATH = "$env:PATH;$env:LOCALAPPDATA\Microsoft\WinGet\Links"

    function Run($script) {
        $out = & node $script 2>&1 | Out-String
        Add-Content -Path $logFile -Value $out -Encoding utf8
        if ($LASTEXITCODE -ne 0) { Log "FAIL: $script (exit $LASTEXITCODE)" } else { Log "OK: $script" }
    }
    function CommitData($paths, $message) {
        git diff --quiet -- @paths
        if ($LASTEXITCODE -eq 0) { return }
        git add -- @paths
        git commit -q -m $message -- @paths
        Log "commit: $message"
    }

    if ($Mode -eq 'publish') {
        Run 'scripts/claim-due-posts.js'
        # 발행 전에 claim 상태를 커밋해 둔다 — 발행 도중 PC가 꺼져도 claimed로 남아 같은 글을 다시 올리지 않는다.
        CommitData @('data/queue.json') 'chore: claim due posts for publishing'
        Run 'scripts/publish-claimed-posts.js'
        CommitData @('data/queue.json') 'chore: update published post queue'
    } else {
        Run 'scripts/generate-topics.js'
        Run 'scripts/daily-auto-post.js'
        Run 'scripts/verify-no-duplicate-media.js'
        Run 'scripts/verify-topic-media-alignment.js'
        CommitData @('data') 'chore: queue daily Land in Korea topic'
    }

    # 원격은 대시보드와 기록 보관용 — 실패해도 발행에는 영향 없다.
    git pull -q --rebase --autostash origin main 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { git rebase --abort 2>&1 | Out-Null; Log "WARN: git pull 실패" }
    else { git push -q origin main 2>&1 | Out-Null; if ($LASTEXITCODE -ne 0) { Log "WARN: git push 실패" } }
} finally {
    $mutex.ReleaseMutex()
}
