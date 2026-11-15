# Ghi token bot Telegram vào tro-ly/cau-hinh.json mà không hiện token trên màn hình hay trong chat.
# Chạy: powershell -ExecutionPolicy Bypass -File tro-ly\nhap-telegram.ps1
$p = Join-Path $PSScriptRoot 'cau-hinh.json'
if (-not (Test-Path $p)) { Write-Host 'Chua co tro-ly\cau-hinh.json' -ForegroundColor Red; return }
$s = Read-Host 'Dan token BotFather (Ctrl+V, chu se bi an), roi nhan Enter' -AsSecureString
$t = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)).Trim()
if ($t -notmatch '^\d+:[A-Za-z0-9_-]{30,}$') { Write-Host 'Token khong dung dang 123456:ABC... Hay chep lai tu BotFather.' -ForegroundColor Red; return }
$c = Get-Content $p -Raw -Encoding UTF8 | ConvertFrom-Json
$c.telegramToken = $t
$c.telegramChatId = ''
[IO.File]::WriteAllText($p, ($c | ConvertTo-Json), (New-Object Text.UTF8Encoding $false))
$me = Invoke-RestMethod "https://api.telegram.org/bot$t/getMe"
Write-Host ('Da luu token. Ten bot: @' + $me.result.username) -ForegroundColor Green
Write-Host 'Gio mo bot tren Telegram va gui /start.'
& node (Join-Path $PSScriptRoot 'bot.js')
