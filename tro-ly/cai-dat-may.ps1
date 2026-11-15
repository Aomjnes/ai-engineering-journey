# Cài hai việc tự chạy trên máy Windows của bạn (không cần quyền Administrator):
#   1. Bot Telegram tự mở mỗi khi đăng nhập Windows (một cửa sổ thu nhỏ; đóng nó là bot dừng).
#   2. AI kiểm tra thành quả lúc 21:45 mỗi tối và gửi nhận xét.
# Chạy:  powershell -ExecutionPolicy Bypass -File tro-ly\cai-dat-may.ps1
# Gỡ:    powershell -ExecutionPolicy Bypass -File tro-ly\cai-dat-may.ps1 -Go

param([switch]$Go, [switch]$KhongMoBot)

$troLy = $PSScriptRoot
$node = (Get-Command node -ErrorAction Stop).Source
$startup = [Environment]::GetFolderPath('Startup')
$botCmd = Join-Path $startup 'ai-eng-bot.cmd'
$taskName = 'AI Engineering - kiem tra cuoi ngay'

if ($Go) {
    Remove-Item $botCmd -ErrorAction SilentlyContinue
    try { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction Stop } catch {}
    Write-Host 'Da go bot tu khoi dong va lich kiem tra.'
    return
}

if (-not (Test-Path (Join-Path $troLy 'cau-hinh.json'))) {
    Write-Host 'Chua co tro-ly\cau-hinh.json. Lam buoc 4 va 5 trong HUONG-DAN.md truoc.' -ForegroundColor Red
    return
}

# 1. Bot: một file .cmd trong thư mục Startup
"@echo off`r`ntitle Tro ly AI Engineering (dong cua so nay de dung bot)`r`n`"$node`" `"$troLy\bot.js`"`r`n" |
    Set-Content -Path $botCmd -Encoding ascii
Write-Host "Da tao $botCmd"

# 2. Kiểm tra cuối ngày: Task Scheduler, 21:45 hằng ngày
$action = New-ScheduledTaskAction -Execute $node -Argument "`"$troLy\kiem-tra.js`"" -WorkingDirectory (Split-Path $troLy)
$trigger = New-ScheduledTaskTrigger -Daily -At '21:45'
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 15)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Write-Host "Da tao lich '$taskName' luc 21:45 moi ngay."

if ($KhongMoBot) { Write-Host 'Bot se tu chay tu lan dang nhap Windows sau.'; return }
Start-Process -FilePath $botCmd -WindowStyle Minimized
Write-Host 'Da mo bot. Nhan /start cho bot tren Telegram de thu.'
