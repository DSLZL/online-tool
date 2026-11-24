# 一键安装 Claude Code 环境（先检测，缺失才下载安装）
# 顺序：Node.js LTS x64 → npm → bun → @anthropic-ai/claude-code → CC-Switch
# 镜像：自动测速选阿里云 / 官方源；国内走 npmmirror 与 gh-proxy
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File .\install-claude-env.ps1

$ErrorActionPreference = 'Stop'
$ProgressPreference    = 'SilentlyContinue'   # IWR 自带进度条很慢；下载进度由 Get-File 自己画
$AliyunNode = 'https://mirrors.aliyun.com/nodejs-release'
$NodeOrg    = 'https://nodejs.org/dist'
$TmpDir     = Join-Path $env:TEMP ('claude-setup-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $TmpDir | Out-Null

function Get-Latency([string]$Base) {
    # 两个源各测一次 HEAD；3 秒不通算最慢
    $sw = [Diagnostics.Stopwatch]::StartNew()
    try { Invoke-WebRequest "$Base/index.json" -Method Head -UseBasicParsing -TimeoutSec 3 | Out-Null; $sw.ElapsedMilliseconds }
    catch { [int]::MaxValue }
}
# 取快的那个；顺带决定 npm 与 GitHub 是否走国内镜像
$NodeBase    = if ((Get-Latency $AliyunNode) -le (Get-Latency $NodeOrg)) { $AliyunNode } else { $NodeOrg }
$IsCn        = $NodeBase -eq $AliyunNode
$NpmRegistry = if ($IsCn) { 'https://registry.npmmirror.com' } else { 'https://registry.npmjs.org' }
$GhPrefix    = if ($IsCn) { 'https://v4.gh-proxy.org/' } else { '' }
$env:BUN_CONFIG_REGISTRY = $NpmRegistry       # bun 的 registry 环境变量兜底

function Sync-Path([string]$Add) {
    # 刷新本会话 PATH；给了 $Add 才持久化到用户 PATH（npm 全局 bin、~/.bun/bin）
    if ($Add) {
        $up = [Environment]::GetEnvironmentVariable('Path', 'User')
        if (($up -split ';') -notcontains $Add) {
            [Environment]::SetEnvironmentVariable('Path', $up.TrimEnd(';') + ';' + $Add, 'User')
        }
    }
    $env:Path = [Environment]::ExpandEnvironmentVariables(
        [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
        [Environment]::GetEnvironmentVariable('Path', 'User'))
    if ($Add -and ($env:Path -split ';') -notcontains $Add) { $env:Path += ";$Add" }
}

function Get-File([string]$Url, [string]$Path) {
    # 流式下载 + Write-Progress；断点续传（Range）＋ 中断自动重试 3 次
    # 自绘进度条而非 IWR：IWR 的进度条每块都重绘，慢得离谱；每块 256KB
    $ProgressPreference = 'Continue'   # 函数作用域内临时打开
    $name = Split-Path -Leaf $Path
    for ($attempt = 1; ; $attempt++) {
        $res = $in = $dst = $null
        $done = if (Test-Path $Path) { [long](Get-Item $Path).Length } else { 0 }
        try {
            $req = [Net.HttpWebRequest]::Create($Url)
            $req.UserAgent        = 'Mozilla/5.0'   # 阿里云镜像对无 UA 的请求返回 403
            $req.Timeout          = 30000
            $req.ReadWriteTimeout = 30000
            if ($done -gt 0) { $req.AddRange($done) }   # Range: bytes=$done- 从断点续传
            $res   = $req.GetResponse()                 # 默认跟随 302
            $mode  = [IO.FileMode]::Create
            $total = $res.ContentLength
            if ($done -gt 0 -and [int]$res.StatusCode -eq 206) { $total += $done; $mode = [IO.FileMode]::Append }
            else { $done = 0 }                          # 200：服务器不支持 Range，从头下
            $in  = $res.GetResponseStream()
            $dst = [IO.File]::Open($Path, $mode, [IO.FileAccess]::Write)
            $buf = New-Object byte[] 262144
            while (($n = $in.Read($buf, 0, $buf.Length)) -gt 0) {
                $dst.Write($buf, 0, $n); $done += $n
                $pct    = if ($total -gt 0) { [int]($done * 100 / $total) } else { -1 }
                $status = if ($total -gt 0) { '{0:N1} / {1:N1} MB' -f ($done / 1MB), ($total / 1MB) } else { '{0:N1} MB' -f ($done / 1MB) }
                Write-Progress -Activity "下载 $name" -Status $status -PercentComplete $pct
            }
            # chunked 拿不到总长时无法校验，只能信它读到流尾；否则下坏了 msiexec 报错很晦涩
            if ($total -gt 0 -and $done -ne $total) { throw "下载不完整（$done / $total 字节）" }
            return
        } catch {
            # 416 = 续传起点越界，说明文件其实已下满，直接算成功
            $we = $_.Exception -as [Net.WebException]
            if (-not $we) { $we = $_.Exception.InnerException -as [Net.WebException] }
            if ($we -and $we.Response -and [int]$we.Response.StatusCode -eq 416) { $we.Response.Dispose(); return }
            if ($attempt -ge 3) { throw "下载失败（已重试 3 次）：$Url`n$($_.Exception.Message)" }
            $kept = (Get-Item $Path -ErrorAction SilentlyContinue).Length
            Write-Warning "第 $attempt 次中断（已保留 $([Math]::Round($kept / 1MB, 1)) MB，2 秒后续传）：$($_.Exception.Message)"
            Start-Sleep -Seconds 2
        } finally {
            foreach ($x in $dst, $in, $res) { if ($x) { $x.Dispose() } }   # FileShare.None，不关掉下次续传打不开
            Write-Progress -Activity "下载 $name" -Completed
        }
    }
}

function Install-Msi([string]$Path) {
    # 非管理员时用 RunAs 弹 UAC
    $verb = if (([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
                  [Security.Principal.WindowsBuiltInRole]::Administrator)) { @{} } else { @{ Verb = 'RunAs' } }
    $p = Start-Process msiexec.exe -ArgumentList ('/i "{0}" /qn /norestart' -f $Path) -Wait -PassThru @verb
    # 3010 = 成功但需重启；RunAs 下 ExitCode 可能取不到，取不到就不判失败
    if ($null -ne $p.ExitCode -and $p.ExitCode -notin 0, 3010) { throw "MSI 安装失败（exit $($p.ExitCode)）：$Path" }
}

function Install-Tool([string]$Name, [string]$Cmd, [string]$Exe, [string[]]$ArgList, [scriptblock]$Bin, [switch]$Warn) {
    # 检查 → 安装 → 补 PATH → 复核。Bin 懒求值：npm prefix -g 有秒级开销，已装时不该跑
    if (Get-Command $Cmd -ErrorAction SilentlyContinue) { Write-Host "  已安装 $Name $(& $Cmd --version)，跳过。"; return }
    & $Exe @ArgList
    if ($LASTEXITCODE -ne 0) { throw "$Name 安装失败（exit $LASTEXITCODE）" }
    $dir = if ($Bin) { & $Bin } else { '' }
    Sync-Path $dir
    if (Get-Command $Cmd -ErrorAction SilentlyContinue) { Write-Host "  已安装 $Name" -ForegroundColor Green }
    elseif ($Warn) { Write-Warning "$Name 已装入 $dir，但本会话 PATH 未生效，重开终端即可。" }
    else { throw "$Name 已安装但不在 PATH 中，请重开终端后重新运行本脚本。" }
}

function Get-InstalledVersion([string]$Pattern) {
    # 从卸载注册表项读已安装版本
    Get-ItemProperty 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
                     'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
                     'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName -like $Pattern } | Select-Object -First 1 -ExpandProperty DisplayVersion
}

try {
    # ---------- 1. Node.js LTS ----------
    Write-Host "[1/5] 检查 Node.js LTS ...（源：$NodeBase）" -ForegroundColor Cyan
    # PS 5.1 的 Invoke-RestMethod 会把 JSON 数组当单个对象输出，必须先赋值再管道筛选
    $allNode = Invoke-RestMethod "$NodeBase/index.json"
    $lts     = $allNode | Where-Object { $_.lts } | Select-Object -First 1
    $ltsVer  = [version]$lts.version.TrimStart('v')
    $curVer  = if (Get-Command node -ErrorAction SilentlyContinue) { try { [version]((& node --version).TrimStart('v')) } catch { } }
    if ($curVer -and $curVer.Major -ge $ltsVer.Major) {
        Write-Host "  已安装 Node v$curVer（最新 LTS 为 $($lts.version)），跳过。"
    } else {
        $url = "$NodeBase/$($lts.version)/node-$($lts.version)-x64.msi"
        $msi = Join-Path $TmpDir 'node-lts-x64.msi'
        Write-Host "  下载 $url"
        Get-File $url $msi
        Install-Msi $msi
        Sync-Path
        Write-Host "  已安装 Node $($lts.version)" -ForegroundColor Green
    }

    # ---------- 2. npm ----------
    Write-Host '[2/5] 检查 npm ...' -ForegroundColor Cyan
    # npm 正常随 Node 自带；缺失时用自带的 npm-cli.js 引导安装
    $npmCli = Join-Path (Split-Path (Get-Command node).Source) 'node_modules\npm\bin\npm-cli.js'
    if (-not (Get-Command npm -ErrorAction SilentlyContinue) -and -not (Test-Path $npmCli)) { throw '找不到 npm，请重新运行 Node.js 安装程序修复。' }
    Install-Tool 'npm' 'npm' 'node' @($npmCli, 'install', '-g', 'npm', "--registry=$NpmRegistry")

    # ---------- 3. bun ----------
    Write-Host '[3/5] 检查 bun ...' -ForegroundColor Cyan
    Install-Tool 'bun' 'bun' 'npm' @('install', '-g', 'bun', "--registry=$NpmRegistry") { npm prefix -g }

    # ---------- 4. Claude Code（官方包名是 @anthropic-ai/claude-code） ----------
    Write-Host '[4/5] 检查 Claude Code ...' -ForegroundColor Cyan
    Install-Tool 'Claude Code' 'claude' 'bun' @('install', '-g', '@anthropic-ai/claude-code', "--registry=$NpmRegistry") { Join-Path $env:USERPROFILE '.bun\bin' } -Warn

    # ---------- 5. CC-Switch（取 GitHub latest，失败回退 v4.0.36） ----------
    Write-Host '[5/5] 检查 CC-Switch ...' -ForegroundColor Cyan
    $rel = try { Invoke-RestMethod 'https://api.github.com/repos/farion1231/cc-switch/releases/latest' -Headers @{ 'User-Agent' = 'ps-setup' } -TimeoutSec 8 } catch { }
    # 精确匹配 x64 包：*Windows.msi 排除掉 Windows-arm64.msi
    $asset = $rel.assets | Where-Object { $_.name -like '*Windows.msi' } | Select-Object -First 1
    if (-not $asset) { Write-Host '  获取 latest 版本失败，回退到 v4.0.36。' }
    $latestVer = if ($asset) { $rel.tag_name.TrimStart('v') } else { '4.0.36' }
    $assetUrl  = if ($asset) { $asset.browser_download_url } else { 'https://github.com/farion1231/cc-switch/releases/download/v4.0.36/CC-Switch-v4.0.36-Windows.msi' }
    $installedVer = try { [version](Get-InstalledVersion '*CC*Switch*') } catch { }
    if ($installedVer -ge [version]$latestVer) {
        Write-Host "  已安装 CC-Switch $installedVer，跳过。"
    } else {
        $url = $GhPrefix + $assetUrl
        $msi = Join-Path $TmpDir 'cc-switch.msi'
        Write-Host "  下载 $url"
        Get-File $url $msi
        Install-Msi $msi
        Write-Host "  已安装 CC-Switch $latestVer" -ForegroundColor Green
    }

    # ---------- 汇总自检 ----------
    Write-Host "`n完成，版本自检：" -ForegroundColor Green
    $missing = $false
    foreach ($c in 'node', 'npm', 'bun', 'claude') {
        if (Get-Command $c -ErrorAction SilentlyContinue) { Write-Host ("  {0,-6} {1}" -f $c, ((& $c --version) -join ' ')) }
        else { $missing = $true; Write-Warning "$c 不在当前 PATH 中，请重开终端后再试。" }
    }
    $cc = Get-InstalledVersion '*CC*Switch*'
    if ($cc) { Write-Host "  cc-switch $cc" }
    else { $missing = $true; Write-Warning 'CC-Switch 未在注册表中找到。' }
    if ($missing) { exit 1 }
} finally {
    Remove-Item $TmpDir -Recurse -Force -ErrorAction SilentlyContinue
}
