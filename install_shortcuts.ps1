# Creates TempVault shortcuts: Desktop app, Desktop Inbox folder, and Explorer "Send to" entry.
$py = "C:\Users\LOQ\AppData\Local\Programs\Python\Python310\pythonw.exe"
$script = Join-Path $PSScriptRoot "tempvault.py"
$inbox = Join-Path $env:USERPROFILE "TempVault\Inbox"
New-Item -ItemType Directory -Force -Path $inbox | Out-Null
$shell = New-Object -ComObject WScript.Shell

function New-Link([string]$lnkPath, [string]$target, [string]$arguments, [string]$icon) {
    $s = $shell.CreateShortcut($lnkPath)
    $s.TargetPath = $target
    $s.Arguments = $arguments
    $s.WorkingDirectory = $PSScriptRoot
    if ($icon) { $s.IconLocation = $icon }
    $s.Save()
    Write-Output "created $lnkPath"
}

$desktop = [Environment]::GetFolderPath("Desktop")
$sendTo = [Environment]::GetFolderPath("SendTo")
New-Link (Join-Path $desktop "TempVault.lnk") $py ('"' + $script + '"') "shell32.dll,45"
New-Link (Join-Path $desktop "TempVault Inbox.lnk") $inbox "" "shell32.dll,45"
New-Link (Join-Path $sendTo "TempVault.lnk") $py ('"' + $script + '" --add') "shell32.dll,45"
