param(
    [Parameter(Mandatory = $true)]
    [string]$Dir
)

# Checks every file in $Dir for a Zone.Identifier alternate data stream.
# That stream is what Mark-of-the-Web (MOTW) leaves behind; it is what makes
# Windows show "this file came from the internet" and blocks/bypasses the
# downloaded-executable prompts.

if (-not (Test-Path -LiteralPath $Dir)) {
    Write-Error "Directory not found: $Dir"
    exit 2
}

$files = Get-ChildItem -LiteralPath $Dir -File
if ($files.Count -eq 0) {
    Write-Host "No files in $Dir"
    exit 2
}

Write-Host "Directory: $((Resolve-Path -LiteralPath $Dir).Path)"
Write-Host ""

$found = 0
foreach ($f in $files) {
    $streams = Get-Item -LiteralPath $f.FullName -Stream *
    $zones = @($streams | Where-Object { $_.Stream -eq 'Zone.Identifier' })

    if ($zones.Count -gt 0) {
        $found++
        $body = Get-Content -LiteralPath $f.FullName -Stream 'Zone.Identifier' -ErrorAction SilentlyContinue
        Write-Host ("  MOTW  {0}  ({1} bytes)" -f $f.Name, $f.Length) -ForegroundColor Yellow
        foreach ($line in $body) { Write-Host "        $line" }
    }
    else {
        Write-Host ("  -     {0}  ({1} bytes)" -f $f.Name, $f.Length)
    }
}

Write-Host ""
Write-Host ("Summary: {0} of {1} file(s) carry Zone.Identifier" -f $found, $files.Count)
if ($found -gt 0) {
    Write-Host "MOTW IS present -> page text must warn about security prompts." -ForegroundColor Yellow
    exit 0
}
Write-Host "MOTW is absent -> page text must still not promise it never appears." -ForegroundColor Green
exit 0
