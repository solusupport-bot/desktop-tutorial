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
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $env:PATH = "$env:PATH;$env:LOCALAPPDATA\Microsoft\WinGet\Links"
    # credential.helper=manager가 인증을 다시 물어야 하는 상황이면 무인 실행에서 프롬프트가
    # 뜰 사람이 없어 git 프로세스가 영원히 멈춰버린다(2026-09-30에 git.exe 8개가 쌓여있었다) — 실패시키고 넘어가게 한다.
    $env:GIT_TERMINAL_PROMPT = '0'

    # 2026-10-02: 예전엔 "커밋 다음에" --autostash로 pull했다. 그 시점엔 이미 이번
    # 실행이 만든 커밋 + 오래 방치된 미커밋 파일(예: media_host.js)이 섞여 있었고,
    # 거기에 deploy-blog-cloudflare.ps1(별도 작업 스케줄러 작업, 뮤텍스 공유 안 함)이
    # 같은 저장소에 동시에 git을 건드리면서 stash pop이 충돌 — 깨진 채 커밋된 파일이
    # require() 단계에서 터져 발행 체인 전체가 마비됐다. 뮤텍스를 두 스크립트가
    # 공유하게 해서 동시 실행 자체를 막고(아래), pull은 "아무것도 고치기 전" 한
    # 번만 autostash로 하고 그 뒤로는 다시 pull하지 않는다(대시보드 syncAndCommit과
    # 동일한 순서) — autostash가 줍는 미커밋 파일은 이 시점엔 아직 아무도 안
    # 건드렸으므로 pop이 안전하다.
    git pull -q --rebase --autostash origin main 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        git rebase --abort 2>&1 | Out-Null
        Log "FAIL: 실행 전 git pull 실패 — 작업 트리가 깨끗하지 않을 수 있습니다. 이번 실행을 건너뜁니다."
        return
    }

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
        # 2026-10-18: Instagram만 영상 하드룰 때문에 하루 3개 목표에서 자주 빠졌다(실측) —
        # 15분 주기로 같이 돌면서 오늘 몫이 부족하면 공유 로테이션에서 다음 주제를 더
        # 뽑아 채운다(중복 방지는 pickNextTopic이, 시간 랜덤은 queueOneTopic이 그대로 담당).
        Run 'scripts/ensure-instagram-daily.js'
        CommitData @('data') 'chore: backfill today Instagram quota'
    } else {
        Run 'scripts/generate-topics.js'
        Run 'scripts/daily-auto-post.js'
        Run 'scripts/verify-no-duplicate-media.js'
        Run 'scripts/verify-topic-media-alignment.js'
        # 하루 한 번 발행된 글의 성과(조회·좋아요·댓글·공유)를 모은다 — 유형별 비교(pattern-performance.js)의 원재료.
        Run 'scripts/collect-insights.js'
        CommitData @('data') 'chore: queue daily Land in Korea topic'
    }

    # 실행 시작할 때 이미 pull했고 그 뒤로는 이 스크립트의 커밋만 쌓였으니 다시 pull할
    # 필요 없다 — push만 한다. 원격에 새 커밋이 있어 거부되면(다른 프로세스가 그 사이
    # 푸시) 강제로 합치지 않고 다음 실행에 넘긴다(대시보드와 동일한 "안전한 정지" 철학).
    git push -q origin main 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Log "WARN: git push 실패 — 원격에 새 커밋이 있을 수 있음, 다음 실행에서 pull 후 재시도됨" }
} finally {
    $mutex.ReleaseMutex()
}
