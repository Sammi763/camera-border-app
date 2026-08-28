<#
.SYNOPSIS
  在 Windows x64 上安装、启动、检查并卸载 Camera Border。

.DESCRIPTION
  这是给 Windows 原生 runner 或干净测试机使用的自动冒烟脚本，不会关闭
  Defender/SmartScreen，也不会修改系统安全策略。它使用 NSIS 的静默参数
  进行可重复的安装和卸载；真实用户的双击图形化安装仍需按 release-checklist
  手动验收。
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $false)]
  [string] $InstallerPath,

  [Parameter(Mandatory = $false)]
  [string] $InstallerDirectory = (Join-Path $PSScriptRoot "..\electron\release\win-x64"),

  [Parameter(Mandatory = $false)]
  [switch] $KeepInstalled
)

$ErrorActionPreference = "Stop"

function Fail([string] $Message) {
  throw "[windows-smoke] $Message"
}

function Find-Installer {
  if ($InstallerPath) {
    $resolved = [System.IO.Path]::GetFullPath($InstallerPath)
    if (-not (Test-Path -LiteralPath $resolved -PathType Leaf)) {
      Fail "安装包不存在：$resolved"
    }
    return Get-Item -LiteralPath $resolved
  }

  $candidates = @(Get-ChildItem -LiteralPath $InstallerDirectory -Filter "Camera-Border-Setup-*.exe" -File)
  if ($candidates.Count -ne 1) {
    Fail "安装目录中必须有且只有一个 Camera-Border-Setup-*.exe，当前为 $($candidates.Count) 个"
  }
  return $candidates[0]
}

function Wait-Until([scriptblock] $Condition, [int] $TimeoutSeconds, [string] $Description) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    try {
      if (& $Condition) { return }
    } catch {
      # 启动阶段的文件/端口尚未出现时继续轮询，最终统一报告超时原因。
    }
    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $deadline)
  Fail "等待超时：$Description"
}

function Find-Shortcut([string] $Root) {
  if (-not (Test-Path -LiteralPath $Root -PathType Container)) { return $null }
  return Get-ChildItem -LiteralPath $Root -Filter "Camera Border.lnk" -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
}

function Find-UninstallEntry {
  $roots = @(
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall",
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall",
    "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"
  )
  foreach ($root in $roots) {
    if (-not (Test-Path $root)) { continue }
    foreach ($key in Get-ChildItem $root -ErrorAction SilentlyContinue) {
      $entry = Get-ItemProperty $key.PSPath -ErrorAction SilentlyContinue
      if ($entry.DisplayName -like "Camera Border*") { return $entry }
    }
  }
  return $null
}

function Get-JavaEngineProcesses {
  # 只匹配本应用的 jar，不误报用户机器上其它 Java 程序。
  Get-CimInstance Win32_Process -Filter "Name = 'java.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*camera-border-engine.jar*" }
}

function Stop-JavaEngineProcesses {
  foreach ($process in @(Get-JavaEngineProcesses)) {
    Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
  }
}

$installer = $null
$smokeRoot = Join-Path $env:TEMP "Camera-Border-Smoke-$PID"
$installDir = Join-Path $smokeRoot "Camera Border"
$userDataRoot = Join-Path $env:APPDATA "Camera Border"
$desktopRoot = [Environment]::GetFolderPath("Desktop")
$startMenuRoot = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"
$appExe = Join-Path $installDir "Camera Border.exe"
$uninstaller = Join-Path $installDir "Uninstall Camera Border.exe"
$engineLog = Join-Path $userDataRoot "logs\engine.log"
$appProcess = $null
$smokeSucceeded = $false

try {
  $installer = Find-Installer
  $versionMatch = [regex]::Match($installer.BaseName, "^Camera-Border-Setup-(?<version>.+)-x64$")
  if (-not $versionMatch.Success) { Fail "安装包文件名不符合 Windows x64 约定：$($installer.Name)" }

  New-Item -ItemType Directory -Path $smokeRoot -Force | Out-Null
  Write-Host "[windows-smoke] 安装：$($installer.FullName)"
  # Start-Process 不会自动保留含空格参数的外层引号，必须显式写入转义双引号。
  $installArguments = "/S /D=`"$installDir`""
  $install = Start-Process -FilePath $installer.FullName -ArgumentList $installArguments -Wait -PassThru
  if ($install.ExitCode -ne 0) { Fail "NSIS 安装失败，退出码：$($install.ExitCode)" }

  if (-not (Test-Path -LiteralPath $appExe -PathType Leaf)) { Fail "安装后缺少应用主程序：$appExe" }
  if (-not (Test-Path -LiteralPath (Join-Path $installDir "resources\frontend\index.html") -PathType Leaf)) { Fail "安装后缺少 frontend/index.html" }
  if (-not (Test-Path -LiteralPath (Join-Path $installDir "resources\java-engine\camera-border-engine.jar") -PathType Leaf)) { Fail "安装后缺少 Java Engine JAR" }
  $javaExe = Join-Path $installDir "resources\java-runtime\bin\java.exe"
  if (-not (Test-Path -LiteralPath $javaExe -PathType Leaf)) { Fail "安装后缺少随包 java.exe" }

  $desktopShortcut = Find-Shortcut $desktopRoot
  $startMenuShortcut = Find-Shortcut $startMenuRoot
  if (-not $desktopShortcut) { Fail "没有创建桌面快捷方式" }
  if (-not $startMenuShortcut) { Fail "没有创建开始菜单快捷方式" }

  $uninstallEntry = Find-UninstallEntry
  if (-not $uninstallEntry) { Fail "没有找到 Windows 卸载注册项" }
  if (-not (Test-Path -LiteralPath $uninstaller -PathType Leaf)) { Fail "安装后缺少卸载程序" }

  Write-Host "[windows-smoke] 启动应用并等待本地 Java 引擎..."
  $appProcess = Start-Process -FilePath $appExe -PassThru
  Wait-Until { -not $appProcess.HasExited } 20 "Camera Border 主进程保持运行"
  Wait-Until {
    if (-not (Test-Path -LiteralPath $engineLog -PathType Leaf)) { return $false }
    $log = Get-Content -LiteralPath $engineLog -Raw -ErrorAction SilentlyContinue
    $match = [regex]::Match($log, "baseUrl=http://127\.0\.0\.1:(?<port>\d+)")
    if (-not $match.Success) { return $false }
    $port = [int]$match.Groups["port"].Value
    try {
      $response = Invoke-WebRequest -Uri "http://127.0.0.1:$port/api/health" -UseBasicParsing -TimeoutSec 2
      return $response.StatusCode -ge 200 -and $response.StatusCode -lt 300
    } catch {
      return $false
    }
  } 60 "Java 引擎健康检查"

  if (-not (Get-JavaEngineProcesses)) { Fail "应用启动后没有发现随包 Java 引擎进程" }
  Write-Host "[windows-smoke] 引擎健康检查通过"

  # 主验收路径：窗口正常关闭（CloseMainWindow → WaitForExit），随后确认 Java 引擎退出。
  # Stop-Process -Force 只允许出现在 finally 的超时清理兜底中，不作为主验收路径。
  if (-not $appProcess.CloseMainWindow()) {
    Fail "无法向应用主窗口发送关闭请求（窗口未就绪）"
  }
  if (-not $appProcess.WaitForExit(15000)) {
    Fail "应用主窗口关闭后 15 秒内未退出"
  }
  $appProcess.WaitForExit() # 等待进程句柄完全回收（事件/退出码可用）
  $appProcess = $null
  # 覆盖「Java 引擎残留」失败路径：正常退出后随包 Java 必须自行退出，超时即失败
  Wait-Until { -not (Get-JavaEngineProcesses) } 15 "应用正常退出后 Java 引擎残留"
  Write-Host "[windows-smoke] 正常退出竞态检查通过"

  if (-not $KeepInstalled) {
    Write-Host "[windows-smoke] 卸载应用..."
    $uninstall = Start-Process -FilePath $uninstaller -ArgumentList "/S" -Wait -PassThru
    if ($uninstall.ExitCode -ne 0) { Fail "NSIS 卸载失败，退出码：$($uninstall.ExitCode)" }
    Wait-Until { -not (Test-Path -LiteralPath $installDir) } 20 "程序目录删除"
    if (Test-Path -LiteralPath $userDataRoot) {
      Write-Host "[windows-smoke] 用户数据目录保留：$userDataRoot"
    }
    Write-Host "[windows-smoke] 安装/启动/卸载冒烟通过"
  } else {
    Write-Host "[windows-smoke] 已保留安装：$installDir"
  }
  $smokeSucceeded = $true
} finally {
  # 超时清理兜底：仅当主流程失败且进程仍在时强制终止，不参与主验收路径
  if ($appProcess -and -not $appProcess.HasExited) {
    Stop-Process -Id $appProcess.Id -Force -ErrorAction SilentlyContinue
  }
  if (-not $smokeSucceeded) {
    # 安装、启动、健康检查或卸载任一步失败时，清理本次冒烟残留的 Java 引擎。
    Stop-JavaEngineProcesses
  }
  if (-not $KeepInstalled -and (Test-Path -LiteralPath $smokeRoot)) {
    Remove-Item -LiteralPath $smokeRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}
