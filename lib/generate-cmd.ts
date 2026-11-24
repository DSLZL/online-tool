// Pure cmd implementation of the installer. Must stay 100% ASCII: cmd.exe parses batch files
// with the code page active at read time, so non-ASCII bytes can be split across buffer
// boundaries and turn into bogus commands. chcp does NOT fix this. English only, on purpose.
import type { StepId, Versions } from "./recipes/types";

const MIRROR_CN = "https://registry.npmmirror.com";
const MIRROR_NPM = "https://registry.npmjs.org";
const NODE_CDN_CN = "https://cdn.npmmirror.com/binaries/node";
const NODE_CDN_OFFICIAL = "https://nodejs.org/dist";

function header(v: Versions, generatedAt: string): string[] {
  return [
    "@echo off",
    "setlocal EnableExtensions EnableDelayedExpansion",
    "title online-tool installer",
    `rem generated-by: online-tool installer-generator`,
    `rem generated-at: ${generatedAt}`,
    `rem versions: node=${v.node} bun=${v.bun} claude-code=${v.claudeCode} cc-switch=${v.ccSwitch}`,
    "",
    "set \"TMPDIR=%TEMP%\\online-tool-install\"",
    "if not exist \"%TMPDIR%\" mkdir \"%TMPDIR%\"",
    "",
    "echo This script will:",
    "echo   1. Check what is already installed and skip it",
    "echo   2. Pick a download mirror by reachability",
    "echo   3. Ask for administrator rights when installing MSI packages",
    "echo.",
  ];
}

// curl is present on Windows 10 1803+ and supports -C - for resuming.
function downloadHelper(): string[] {
  return [
    "goto :main",
    "",
    ":download",
    "rem %1 = url, %2 = destination, %3 = label",
    "set \"DL_URL=%~1\"",
    "set \"DL_DEST=%~2\"",
    "set \"DL_LABEL=%~3\"",
    "if exist \"%DL_DEST%\" (",
    "    echo   resuming %DL_LABEL%",
    ") else (",
    "    echo   downloading %DL_LABEL%",
    ")",
    "curl --fail --location --retry 3 --retry-delay 2 --continue-at - --output \"%DL_DEST%\" \"%DL_URL%\"",
    "if errorlevel 1 (",
    "    echo   download failed: %DL_URL%",
    "    if exist \"%DL_DEST%\" del /q \"%DL_DEST%\"",
    "    exit /b 1",
    ")",
    "exit /b 0",
    "",
    ":latency",
    "rem %1 = url to probe. Prints milliseconds, or 99999 on failure.",
    "rem No pipe: inside the double-quoted -Command there is no caret escaping, so ^| reaches",
    "rem PowerShell literally and is a syntax error, which catch swallows into 99999.",
    "set \"LAT_URL=%~1\"",
    "powershell -NoProfile -Command \"try{$s=[Diagnostics.Stopwatch]::StartNew();[void](Invoke-WebRequest -Uri '%LAT_URL%' -Method Head -UseBasicParsing -TimeoutSec 3);Write-Output $s.ElapsedMilliseconds}catch{Write-Output 99999}\"",
    "exit /b 0",
    "",
    ":installed",
    "rem %1 = command name. errorlevel 0 when present.",
    "where %~1 >nul 2>&1",
    "exit /b %errorlevel%",
    "",
    ":installmsi",
    "rem %1 = msi path, %2 = product name. 0 and 3010 both mean success (3010 = reboot pending).",
    "rem Compare by string, not `if errorlevel`: cmd keeps the full value in %errorlevel% but the",
    "rem `if errorlevel N` test is unreliable for values above 255.",
    "set \"IM_MSI=%~1\"",
    "set \"IM_NAME=%~2\"",
    "msiexec.exe /i \"%IM_MSI%\" /qn /norestart",
    "set \"IM_RC=%errorlevel%\"",
    "if \"%IM_RC%\"==\"0\" exit /b 0",
    "if \"%IM_RC%\"==\"3010\" exit /b 0",
    "echo   msiexec returned %IM_RC%, retrying elevated",
    "powershell -NoProfile -Command \"$p=Start-Process msiexec.exe -ArgumentList '/i \\\"%IM_MSI%\\\" /qn /norestart' -Verb RunAs -Wait -PassThru;exit $p.ExitCode\"",
    "set \"IM_RC=%errorlevel%\"",
    "if \"%IM_RC%\"==\"0\" exit /b 0",
    "if \"%IM_RC%\"==\"3010\" exit /b 0",
    "echo   %IM_NAME% failed to install (msiexec %IM_RC%)",
    "exit /b 1",
    "",
    ":main",
  ];
}

function nodeStep(v: Versions, n: number): string[] {
  const vv = v.node.startsWith("v") ? v.node : `v${v.node}`;
  return [
    "",
    `echo [${n}] Node.js ...`,
    "call :installed node",
    "if not errorlevel 1 (",
    "    for /f \"delims=\" %%v in ('node --version 2^>nul') do echo   already installed: %%v",
    "    goto :node_done",
    ")",
    `set "NODE_VER=${vv}"`,
    `set "NODE_CN=${NODE_CDN_CN}"`,
    `set "NODE_ORG=${NODE_CDN_OFFICIAL}"`,
    "call :latency \"%NODE_CN%/index.json\" > \"%TMPDIR%\\lat.txt\"",
    "set /p LAT_CN=<\"%TMPDIR%\\lat.txt\"",
    "call :latency \"%NODE_ORG%/index.json\" > \"%TMPDIR%\\lat.txt\"",
    "set /p LAT_ORG=<\"%TMPDIR%\\lat.txt\"",
    "set \"NODE_BASE=%NODE_ORG%\"",
    "if %LAT_CN% LSS %LAT_ORG% set \"NODE_BASE=%NODE_CN%\"",
    "call :download \"%NODE_BASE%/%NODE_VER%/node-%NODE_VER%-x64.msi\" \"%TMPDIR%\\node.msi\" \"Node.js %NODE_VER%\"",
    "if errorlevel 1 goto :fail",
    "call :installmsi \"%TMPDIR%\\node.msi\" \"Node.js\"",
    "if errorlevel 1 goto :fail",
    "call :refreshpath",
    "echo   Node.js installed",
    ":node_done",
  ];
}

function bunStep(v: Versions, n: number): string[] {
  return [
    "",
    `echo [${n}] Bun ...`,
    "call :installed bun",
    "if not errorlevel 1 (",
    "    for /f \"delims=\" %%v in ('bun --version 2^>nul') do echo   already installed: %%v",
    "    goto :bun_done",
    ")",
    "call :installed npm",
    "if errorlevel 1 (",
    "    echo   npm not found, cannot install bun",
    "    goto :bun_done",
    ")",
    `set "NPM_REG=${MIRROR_NPM}"`,
    "call :latency \"" + MIRROR_CN + "/\" > \"%TMPDIR%\\lat.txt\"",
    "set /p LAT_CN=<\"%TMPDIR%\\lat.txt\"",
    "call :latency \"" + MIRROR_NPM + "/\" > \"%TMPDIR%\\lat.txt\"",
    "set /p LAT_ORG=<\"%TMPDIR%\\lat.txt\"",
    `if !LAT_CN! LSS !LAT_ORG! set "NPM_REG=${MIRROR_CN}"`,
    `call npm install -g bun@${v.bun} --registry=!NPM_REG!`,
    "if errorlevel 1 goto :fail",
    "for /f \"delims=\" %%p in ('npm prefix -g 2^>nul') do call :addpath \"%%p\"",
    "call :refreshpath",
    "echo   Bun installed",
    ":bun_done",
  ];
}

function claudeStep(v: Versions, n: number): string[] {
  return [
    "",
    `echo [${n}] Claude Code ...`,
    "call :installed claude",
    "if not errorlevel 1 (",
    "    for /f \"delims=\" %%v in ('claude --version 2^>nul') do echo   already installed: %%v",
    "    goto :claude_done",
    ")",
    "call :installed bun",
    "if errorlevel 1 (",
    "    echo   bun not found, cannot install Claude Code",
    "    goto :claude_done",
    ")",
    `set "NPM_REG=${MIRROR_NPM}"`,
    "call :latency \"" + MIRROR_CN + "/\" > \"%TMPDIR%\\lat.txt\"",
    "set /p LAT_CN=<\"%TMPDIR%\\lat.txt\"",
    "call :latency \"" + MIRROR_NPM + "/\" > \"%TMPDIR%\\lat.txt\"",
    "set /p LAT_ORG=<\"%TMPDIR%\\lat.txt\"",
    `if !LAT_CN! LSS !LAT_ORG! set "NPM_REG=${MIRROR_CN}"`,
    `call bun install -g @anthropic-ai/claude-code@${v.claudeCode} --registry=!NPM_REG!`,
    "if errorlevel 1 goto :fail",
    "call :addpath \"%USERPROFILE%\\.bun\\bin\"",
    "call :refreshpath",
    "echo   Claude Code installed",
    ":claude_done",
  ];
}

function ccSwitchStep(v: Versions, n: number): string[] {
  return [
    "",
    `echo [${n}] CC-Switch ...`,
    "set \"CC_VER=\"",
    "for /f \"tokens=2,*\" %%a in ('reg query \"HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\" /s /f \"CC-Switch\" 2^>nul ^| findstr /i \"DisplayVersion\"') do (",
    "    if not defined CC_VER set \"CC_VER=%%b\"",
    ")",
    "rem Compare as [version]: cmd's string comparison ranks \"4.0.9\" above \"4.0.40\".",
    "rem A pre-release suffix fails to parse; that is treated as not-installed, which reinstalls.",
    "set \"CC_INSTALLED=0\"",
    "if defined CC_VER (",
    "    powershell -NoProfile -Command \"try{if(([version]'%CC_VER%') -ge ([version]'" + v.ccSwitch + "')){exit 0}else{exit 1}}catch{exit 1}\"",
    "    if not errorlevel 1 set \"CC_INSTALLED=1\"",
    ")",
    "if \"%CC_INSTALLED%\"==\"1\" (",
    "    echo   already installed: %CC_VER%",
    "    goto :cc_done",
    ")",
    `set "CC_URL=${v.ccSwitchUrl}"`,
    `set "CC_VERSION=${v.ccSwitch}"`,
    "call :download \"%CC_URL%\" \"%TMPDIR%\\cc-switch.msi\" \"CC-Switch %CC_VERSION%\"",
    "if errorlevel 1 goto :fail",
    "call :installmsi \"%TMPDIR%\\cc-switch.msi\" \"CC-Switch\"",
    "if errorlevel 1 goto :fail",
    "echo   CC-Switch installed",
    ":cc_done",
  ];
}

const STEP_RENDERERS: Record<StepId, (v: Versions, n: number) => string[]> = {
  node: nodeStep,
  bun: bunStep,
  claudeCode: claudeStep,
  ccSwitch: ccSwitchStep,
};

function helpers(): string[] {
  return [
    "",
    ":addpath",
    "rem %1 = directory to append to the user PATH",
    "set \"AP_DIR=%~1\"",
    "if not defined AP_DIR exit /b 0",
    "powershell -NoProfile -Command \"$d='%AP_DIR%';$p=[Environment]::GetEnvironmentVariable('Path','User');if(($p -split ';') -notcontains $d){[Environment]::SetEnvironmentVariable('Path',($p.TrimEnd(';')+';'+$d),'User')}\"",
    "exit /b 0",
    "",
    ":refreshpath",
    "set \"PATH=%SystemRoot%\\System32;%SystemRoot%;%SystemRoot%\\System32\\Wbem\"",
    "for /f \"delims=\" %%p in ('powershell -NoProfile -Command \"[Environment]::GetEnvironmentVariable('Path','Machine')\"') do set \"PATH=%%p\"",
    "for /f \"delims=\" %%p in ('powershell -NoProfile -Command \"[Environment]::GetEnvironmentVariable('Path','User')\"') do set \"PATH=%PATH%;%%p\"",
    "exit /b 0",
  ];
}

function footer(): string[] {
  return [
    "",
    "echo.",
    "echo Done. Version check:",
    "set \"MISSING=0\"",
    "for %%c in (node npm bun claude) do (",
    "    call :installed %%c",
    "    if errorlevel 1 (",
    "        echo   %%c MISSING",
    "        set \"MISSING=1\"",
    "    ) else (",
    "        for /f \"delims=\" %%v in ('%%c --version 2^>nul') do echo   %%c %%v",
    "    )",
    ")",
    "if \"%MISSING%\"==\"1\" (",
    "    echo.",
    "    echo Some tools are not on PATH yet. Open a new terminal and run this script again.",
    "    pause",
    "    exit /b 1",
    ")",
    "pause",
    "exit /b 0",
    "",
    ":fail",
    "echo.",
    "echo Installation failed. See the messages above.",
    "pause",
    "exit /b 1",
  ];
}

export function generatePureCmd(v: Versions, selected: StepId[], generatedAt: string): string {
  const body = selected.flatMap((id, i) => STEP_RENDERERS[id](v, i + 1));
  const lines = [
    ...header(v, generatedAt),
    ...downloadHelper(),
    ...body,
    ...helpers(),
    ...footer(),
  ];
  // cmd.exe wants CRLF.
  return lines.join("\r\n") + "\r\n";
}
