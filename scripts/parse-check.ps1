# Parses every generated .ps1 sample with the PowerShell parser. Requires Windows.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
    bun run scripts/gen-samples.ts
    $failed = $false
    Get-ChildItem -Path . -Filter '*.sample.ps1' | ForEach-Object {
        $errors = $null
        [System.Management.Automation.Language.Parser]::ParseFile($_.FullName, [ref]$null, [ref]$errors) | Out-Null
        if ($errors.Count -eq 0) {
            Write-Host "  OK   $($_.Name)"
        } else {
            $failed = $true
            Write-Host "  FAIL $($_.Name)" -ForegroundColor Red
            $errors | ForEach-Object { Write-Host "       line $($_.Extent.StartLineNumber): $($_.Message)" }
        }
        Remove-Item $_.FullName
    }
    if ($failed) { exit 1 }
} finally { Pop-Location }
