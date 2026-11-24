import { RUNTIME_PS1 } from "./runtime.generated";
import type { GenerateOptions, StepId, Versions } from "./recipes/types";

const CMD_NAME = "install-claude-env.cmd";
const PS1_NAME = "install-claude-env.ps1";

export interface GeneratedFiles {
  cmdName: string;
  ps1Name: string;
  cmd: string;
  ps1: string;
}

const MIRROR_CN = "https://registry.npmmirror.com";
const MIRROR_NPM = "https://registry.npmjs.org";
const NODE_CDN_CN = "https://cdn.npmmirror.com/binaries/node";
const NODE_CDN_OFFICIAL = "https://nodejs.org/dist";

function header(v: Versions, generatedAt: string): string {
  return [
    `# generated-by: online-tool installer-generator`,
    `# generated-at: ${generatedAt}`,
    `# versions: node=${v.node} bun=${v.bun} claude-code=${v.claudeCode} cc-switch=${v.ccSwitch}`,
    "",
    "$ErrorActionPreference = 'Stop'",
    "$ProgressPreference    = 'SilentlyContinue'",
    "",
    "Write-Host '本脚本将执行以下操作：' -ForegroundColor Cyan",
    "Write-Host '  1. 检测已安装的组件，缺失才安装'",
    "Write-Host '  2. 按网络可达性选择下载源'",
    "Write-Host '  3. 安装 MSI 时可能请求管理员权限（会弹出 UAC）'",
    "Write-Host ''",
  ].join("\n");
}

function footer(): string {
  return [
    "",
    "Write-Host \"`n完成，版本自检：\" -ForegroundColor Green",
    "$missing = $false",
    "foreach ($c in 'node', 'npm', 'bun', 'claude') {",
    "    if (Get-Command $c -ErrorAction SilentlyContinue) { Write-Host ('  {0,-6} {1}' -f $c, ((& $c --version) -join ' ')) }",
    "    else { $missing = $true; Write-Warning \"$c 不在当前 PATH 中，请重开终端后再试。\" }",
    "}",
    "if ($missing) { exit 1 }",
    "",
  ].join("\n");
}

function nodeStep(v: Versions, n: number): string {
  const vv = v.node.startsWith("v") ? v.node : `v${v.node}`;
  return [
    `Write-Host '[${n}] 检查 Node.js LTS ...' -ForegroundColor Cyan`,
    `$nodeVersion = '${vv}'`,
    `$nodeCn = '${NODE_CDN_CN}'`,
    `$nodeOrg = '${NODE_CDN_OFFICIAL}'`,
    "$nodeBase = if ((Get-Latency $nodeCn '/index.json') -le (Get-Latency $nodeOrg '/index.json')) { $nodeCn } else { $nodeOrg }",
    "$curNode = if (Get-Command node -ErrorAction SilentlyContinue) { try { [version]((& node --version).TrimStart('v')) } catch { } }",
    "if ($curNode -and $curNode.Major -ge [version]$nodeVersion.TrimStart('v').Split('.')[0]) {",
    "    Write-Host \"  已安装 Node v$curNode，跳过。\"",
    "} else {",
    "    $url = \"$nodeBase/$nodeVersion/node-$nodeVersion-x64.msi\"",
    "    Write-Host \"  下载 $url\"",
    "    $msi = Join-Path $env:TEMP 'node-lts-x64.msi'",
    "    Get-File $url $msi",
    "    Install-Msi $msi",
    "    Sync-Path",
    "    Write-Host '  已安装 Node' -ForegroundColor Green",
    "}",
  ].join("\n");
}

function bunStep(v: Versions, n: number): string {
  return [
    `Write-Host '[${n}] 检查 bun ...' -ForegroundColor Cyan`,
    "if (Get-Command node -ErrorAction SilentlyContinue) {",
    `    $npmReg = if ((Get-Latency '${MIRROR_CN}' '/') -le (Get-Latency '${MIRROR_NPM}' '/')) { '${MIRROR_CN}' } else { '${MIRROR_NPM}' }`,
    `    Install-Tool 'bun' 'bun' 'npm' @('install', '-g', 'bun@${v.bun}', \"--registry=$npmReg\") { npm prefix -g }`,
    "} else { Write-Warning 'Node 不在 PATH 中，无法安装 bun；请重开终端后重新运行。' }",
  ].join("\n");
}

function claudeStep(v: Versions, n: number): string {
  return [
    `Write-Host '[${n}] 检查 Claude Code ...' -ForegroundColor Cyan`,
    "if (Get-Command bun -ErrorAction SilentlyContinue) {",
    `    $npmReg = if ((Get-Latency '${MIRROR_CN}' '/') -le (Get-Latency '${MIRROR_NPM}' '/')) { '${MIRROR_CN}' } else { '${MIRROR_NPM}' }`,
    `    Install-Tool 'Claude Code' 'claude' 'bun' @('install', '-g', '@anthropic-ai/claude-code@${v.claudeCode}', \"--registry=$npmReg\") { Join-Path $env:USERPROFILE '.bun\\\\bin' } -Warn`,
    "} else { Write-Warning 'bun 不在 PATH 中，无法安装 Claude Code；请重开终端后重新运行。' }",
  ].join("\n");
}

function ccSwitchStep(v: Versions, n: number): string {
  return [
    `Write-Host '[${n}] 检查 CC-Switch ...' -ForegroundColor Cyan`,
    `$ccVersion = '${v.ccSwitch}'`,
    `$ccUrl = '${v.ccSwitchUrl}'`,
    "$installed = try { Get-InstalledVersion '*CC*Switch*' } catch { }",
    "if ($installed -and [version]$installed -ge [version]$ccVersion) {",
    "    Write-Host \"  已安装 CC-Switch $installed，跳过。\"",
    "} else {",
    "    Write-Host \"  下载 $ccUrl\"",
    "    $msi = Join-Path $env:TEMP 'cc-switch.msi'",
    "    Get-File $ccUrl $msi",
    "    Install-Msi $msi",
    "    Write-Host \"  已安装 CC-Switch $ccVersion\" -ForegroundColor Green",
    "}",
  ].join("\n");
}

const STEP_RENDERERS: Record<StepId, (v: Versions, n: number) => string> = {
  node: nodeStep,
  bun: bunStep,
  claudeCode: claudeStep,
  ccSwitch: ccSwitchStep,
};

export function generatePs1(options: GenerateOptions): string {
  const body = options.selected.map((id, i) => STEP_RENDERERS[id](options.versions, i + 1));
  return [header(options.versions, options.generatedAt), RUNTIME_PS1, ...body, footer()].join("\n");
}

// .cmd must stay pure ASCII: cmd.exe reads it in the OEM codepage on zh-CN Windows.
export function generateCmd(): string {
  return [
    "@echo off",
    "powershell -NoProfile -ExecutionPolicy Bypass -File \"%~dp0" + PS1_NAME + "\"",
    "pause",
    "",
  ].join("\r\n");
}

export function generate(options: GenerateOptions): GeneratedFiles {
  return { cmdName: CMD_NAME, ps1Name: PS1_NAME, cmd: generateCmd(), ps1: generatePs1(options) };
}
