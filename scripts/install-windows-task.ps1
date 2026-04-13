# Run as Administrator. Registers two Windows scheduled tasks:
#   - "sbox-terminal up"     — at user logon, brings docker compose up
#   - "sbox-terminal backup" — daily 04:00, pg_dump rotation
#
# Both tasks run hidden, no console window.

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path "$PSScriptRoot\..").Path
$bash = "C:\Program Files\Git\bin\bash.exe"

$upAction = New-ScheduledTaskAction -Execute $bash `
  -Argument "-lc 'cd `"$repo`" && docker compose up -d'"
$upTrigger = New-ScheduledTaskTrigger -AtLogOn
Register-ScheduledTask -TaskName "sbox-terminal up" `
  -Action $upAction -Trigger $upTrigger -Force

$bkAction = New-ScheduledTaskAction -Execute $bash `
  -Argument "-lc '$repo/scripts/backup.sh'"
$bkTrigger = New-ScheduledTaskTrigger -Daily -At 4am
Register-ScheduledTask -TaskName "sbox-terminal backup" `
  -Action $bkAction -Trigger $bkTrigger -Force

Write-Host "Tasks registered. View with: Get-ScheduledTask sbox-terminal*"
