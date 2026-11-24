# Runtime library extracted from install-claude-env.ps1.
# Regenerate lib/runtime.generated.ts after editing: bun run gen:runtime

function Sync-Path([string]$Add) {
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

function Get-Latency([string]$Base, [string]$Probe) {
    $sw = [Diagnostics.Stopwatch]::StartNew()
    try { Invoke-WebRequest "$Base$Probe" -Method Head -UseBasicParsing -TimeoutSec 3 | Out-Null; $sw.ElapsedMilliseconds }
    catch { [int]::MaxValue }
}

function Get-File([string]$Url, [string]$Path) {
    $name = Split-Path -Leaf $Path
    for ($attempt = 1; ; $attempt++) {
        $res = $in = $dst = $null
        $done = if (Test-Path $Path) { [long](Get-Item $Path).Length } else { 0 }
        try {
            $req = [Net.HttpWebRequest]::Create($Url)
            $req.UserAgent        = 'Mozilla/5.0'
            $req.Timeout          = 30000
            $req.ReadWriteTimeout = 30000
            if ($done -gt 0) { $req.AddRange($done) }
            $res   = $req.GetResponse()
            $mode  = [IO.FileMode]::Create
            $total = $res.ContentLength
            if ($done -gt 0 -and [int]$res.StatusCode -eq 206) { $total += $done; $mode = [IO.FileMode]::Append }
            else { $done = 0 }
            $in  = $res.GetResponseStream()
            $dst = [IO.File]::Open($Path, $mode, [IO.FileAccess]::Write)
            $buf = New-Object byte[] 262144
            while (($n = $in.Read($buf, 0, $buf.Length)) -gt 0) {
                $dst.Write($buf, 0, $n); $done += $n
                $pct    = if ($total -gt 0) { [int]($done * 100 / $total) } else { -1 }
                $status = if ($total -gt 0) { '{0:N1} / {1:N1} MB' -f ($done / 1MB), ($total / 1MB) } else { '{0:N1} MB' -f ($done / 1MB) }
                Write-Progress -Activity "下载 $name" -Status $status -PercentComplete $pct
            }
            if ($total -gt 0 -and $done -ne $total) { throw "下载不完整（$done / $total 字节）" }
            return
        } catch {
            $we = $_.Exception -as [Net.WebException]
            if (-not $we) { $we = $_.Exception.InnerException -as [Net.WebException] }
            if ($we -and $we.Response -and [int]$we.Response.StatusCode -eq 416) { $we.Response.Dispose(); return }
            if ($attempt -ge 3) { throw "下载失败（已重试 3 次）：$Url`n$($_.Exception.Message)" }
            $kept = (Get-Item $Path -ErrorAction SilentlyContinue).Length
            Write-Warning "第 $attempt 次中断（已保留 $([Math]::Round($kept / 1MB, 1)) MB，2 秒后续传）：$($_.Exception.Message)"
            Start-Sleep -Seconds 2
        } finally {
            foreach ($x in $dst, $in, $res) { if ($x) { $x.Dispose() } }
            Write-Progress -Activity "下载 $name" -Completed
        }
    }
}

function Install-Msi([string]$Path) {
    $verb = if (([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
                  [Security.Principal.WindowsBuiltInRole]::Administrator)) { @{} } else { @{ Verb = 'RunAs' } }
    $p = Start-Process msiexec.exe -ArgumentList ('/i "{0}" /qn /norestart' -f $Path) -Wait -PassThru @verb
    if ($null -ne $p.ExitCode -and $p.ExitCode -notin 0, 3010) { throw "MSI 安装失败（exit $($p.ExitCode)）：$Path" }
}

function Install-Tool([string]$Name, [string]$Cmd, [string]$Exe, [string[]]$ArgList, [scriptblock]$Bin, [switch]$Warn) {
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
    Get-ItemProperty 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
                     'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
                     'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName -like $Pattern } | Select-Object -First 1 -ExpandProperty DisplayVersion
}
