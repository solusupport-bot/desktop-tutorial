# Windows 작업 스케줄러가 15분마다 이 스크립트를 실행한다.
# GitHub Actions의 schedule 이벤트가 15분 간격에서 92.5% 스킵되는 걸 실측 확인했기 때문에
# (scheduler.yml 참고), workflow_dispatch를 외부(이 PC)에서 직접 호출해 보완한다.
# 토큰은 GH_DISPATCH_TOKEN 환경변수에서 읽는다 (repo에는 저장하지 않음).

$ErrorActionPreference = "Stop"
$repo = "solusupport-bot/desktop-tutorial"
$workflow = "scheduler.yml"
$logFile = Join-Path $PSScriptRoot "trigger.log"

$token = [Environment]::GetEnvironmentVariable("GH_DISPATCH_TOKEN", "User")
if (-not $token) {
    Add-Content -Path $logFile -Value "$(Get-Date -Format o) FAIL: GH_DISPATCH_TOKEN env var not set"
    exit 1
}

$headers = @{
    Authorization          = "Bearer $token"
    Accept                 = "application/vnd.github+json"
    "X-GitHub-Api-Version" = "2022-11-28"
}

try {
    Invoke-RestMethod -Method Post `
        -Uri "https://api.github.com/repos/$repo/actions/workflows/$workflow/dispatches" `
        -Headers $headers `
        -Body (@{ ref = "main" } | ConvertTo-Json) `
        -ContentType "application/json"
    Add-Content -Path $logFile -Value "$(Get-Date -Format o) OK"
} catch {
    Add-Content -Path $logFile -Value "$(Get-Date -Format o) FAIL: $($_.Exception.Message)"
    exit 1
}
