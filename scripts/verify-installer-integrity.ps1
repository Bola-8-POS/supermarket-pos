<#
.SYNOPSIS
    Pre-ship integrity check for a built NSIS installer (Phase 20: Store Deployment:
    Signed Elevated Installer, DEP-02).

.DESCRIPTION
    This is a scripted artifact, not a checkpoint: this repo's CLAUDE.md testing
    policy requires automating verification rather than asking a human to click
    through the app. Unlike scripts/verify-print-broker-install.ps1, this script
    does NOT require elevation - every check here is read-only against local build
    artifacts (the installer .exe, dist/assets/*.js, windows/hooks.nsh,
    src-tauri/tauri.conf.json), not against an installed target machine.

    Fails fast: exits non-zero with a specific message on the FIRST failing check,
    rather than continuing past a failure and producing a partial pass. Exits 0
    with "All checks passed" only when all checks hold.

    Checks, in order:
      1. 7z payload listing of the installer contains broker.exe,
         selfsigned.cer and subject.txt (skipped with a warning, not a
         failure, if 7z.exe is not on PATH - RESEARCH.md Assumption A3's
         documented fallback).
      2. Get-AuthenticodeSignature on the installer reports .SignerCertificate.Thumbprint
         equal to -ExpectedThumbprint (never asserts .Status -eq 'Valid' - a
         self-signed cert legitimately reports NotTrusted/UnknownError on the build
         machine, see RESEARCH.md Pitfall 2).
      3. The installer carries no Mark-of-the-Web (Zone.Identifier alternate data
         stream) - a build artifact about to ship should never have crossed an
         internet-zone boundary yet.
      4. dist/assets/*.js contains the remote Supabase project ref substring, and no
         chunk contains the dev-loopback Supabase URL (127.0.0.1:54321) Vite would bake
         from .env.local instead of .env.production. Note: a bare "localhost"/"127.0.0.1"
         substring search is deliberately NOT used here - @supabase/supabase-js's minified
         internals unconditionally contain "http://localhost:9999" (a GoTrue constant) and
         a hostname-validation regex referencing "localhost" regardless of which env file
         was baked in, so that check would always fail as a false positive. The specific
         local-stack port (54321) is what actually distinguishes a stale/local build.
      5. windows/hooks.nsh (source-side check - the compiled NSIS macro body isn't
         independently extractable from the built installer, RESEARCH.md Pattern 4)
         contains all four expected ExecWait substrings, and tauri.conf.json's
         bundle.windows.nsis.installerHooks still points at ../windows/hooks.nsh.
      6. Taj's customers/taj-house-of-spices/tauri.override.json (Phase 26,
         D-16/D-17) has identifier/bundle.publisher/plugins.updater.endpoints[0]
         byte-identical to the values still hardcoded in src-tauri/tauri.conf.json
         at this point in the phase (Plan 26-05 strips core's config later) -
         source-side check, same shape as Check 2's fail-fast comparison.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$InstallerPath,

    [Parameter(Mandatory)]
    [string]$ExpectedThumbprint,

    [string]$TauriOverridePath = (Join-Path $PSScriptRoot '..\customers\taj-house-of-spices\tauri.override.json')
)

$ErrorActionPreference = 'Stop'

function Fail([string]$Message) {
    Write-Host "FAILED: $Message" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path -LiteralPath $InstallerPath)) {
    Fail "InstallerPath '$InstallerPath' does not exist."
}

# --- Check 1: 7z payload listing contains broker.exe and selfsigned.cer ----
$sevenZip = Get-Command '7z.exe' -ErrorAction SilentlyContinue
if (-not $sevenZip) {
    Write-Host "WARNING: 7z.exe not found on PATH - skipping payload-listing check (RESEARCH.md Assumption A3 fallback)." -ForegroundColor Yellow
} else {
    $listing = & $sevenZip.Source l $InstallerPath 2>&1 | Out-String
    if ($listing -notmatch 'broker\.exe') {
        Fail "7z payload listing of '$InstallerPath' does not contain broker.exe."
    }
    if ($listing -notmatch 'selfsigned\.cer') {
        Fail "7z payload listing of '$InstallerPath' does not contain selfsigned.cer."
    }
    if ($listing -notmatch 'subject\.txt') {
        Fail "7z payload listing of '$InstallerPath' does not contain subject.txt."
    }
    Write-Host "OK: 7z payload listing contains broker.exe, selfsigned.cer and subject.txt." -ForegroundColor Green
}

# --- Check 2: signature thumbprint match (never assert .Status) ------------
$sig = Get-AuthenticodeSignature $InstallerPath
if (-not $sig.SignerCertificate) {
    Fail "'$InstallerPath' is not signed (no SignerCertificate)."
}
if ($sig.SignerCertificate.Thumbprint -ne $ExpectedThumbprint) {
    Fail "thumbprint mismatch: installer signed with '$($sig.SignerCertificate.Thumbprint)', expected '$ExpectedThumbprint'."
}
Write-Host "OK: installer signature thumbprint matches expected ($ExpectedThumbprint)." -ForegroundColor Green

# --- Check 3: no Mark-of-the-Web on the ship-ready artifact -----------------
$zone = Get-Item $InstallerPath -Stream Zone.Identifier -ErrorAction SilentlyContinue
if ($zone) {
    Fail "installer carries Mark-of-the-Web - SmartScreen will evaluate it."
}
Write-Host "OK: installer carries no Mark-of-the-Web." -ForegroundColor Green

# --- Check 4: baked remote URL, never the dev-loopback address -------------
$distAssetsPath = Join-Path $PSScriptRoot '..\dist\assets\*.js'
$distAssets = Get-ChildItem -Path $distAssetsPath -ErrorAction SilentlyContinue
if (-not $distAssets) {
    Fail "No dist/assets/*.js files found - run 'npm run build' before this check."
}

$remoteMatch = Select-String -Path $distAssetsPath -Pattern 'mkvinyekkyennyegfoxq' -ErrorAction SilentlyContinue
if (-not $remoteMatch) {
    Fail "No dist/assets/*.js chunk contains the remote project ref 'mkvinyekkyennyegfoxq' - the build may have baked in a stale/local .env instead of .env.production."
}

$loopbackMatch = Select-String -Path $distAssetsPath -Pattern '127\.0\.0\.1:54321' -ErrorAction SilentlyContinue
if ($loopbackMatch) {
    $badChunk = $loopbackMatch | Select-Object -First 1 -ExpandProperty Path
    Fail "dist/assets chunk '$badChunk' contains the local Supabase stack URL (127.0.0.1:54321) - the build baked in .env.local instead of .env.production."
}
Write-Host "OK: dist/assets/*.js contains the remote project ref and no dev-loopback Supabase URL." -ForegroundColor Green

# --- Check 5: hooks.nsh source-side check + tauri.conf.json wiring ---------
$hooksPath = Join-Path $PSScriptRoot '..\windows\hooks.nsh'
if (-not (Test-Path -LiteralPath $hooksPath)) {
    Fail "windows/hooks.nsh not found at '$hooksPath'."
}
$hooksContent = Get-Content -LiteralPath $hooksPath -Raw
$expectedSubstrings = @(
    'broker.exe" install',
    'netsh advfirewall',
    'sc.exe start PrintBrokerService',
    'certutil -f -addstore Root'
)
foreach ($substring in $expectedSubstrings) {
    if ($hooksContent -notlike "*$substring*") {
        Fail "windows/hooks.nsh is missing expected substring: '$substring'."
    }
}

$tauriConfPath = Join-Path $PSScriptRoot '..\src-tauri\tauri.conf.json'
if (-not (Test-Path -LiteralPath $tauriConfPath)) {
    Fail "src-tauri/tauri.conf.json not found at '$tauriConfPath'."
}
$tauriConf = Get-Content -LiteralPath $tauriConfPath -Raw | ConvertFrom-Json
$installerHooks = $tauriConf.bundle.windows.nsis.installerHooks
if ($installerHooks -ne '../windows/hooks.nsh') {
    Fail "tauri.conf.json bundle.windows.nsis.installerHooks is '$installerHooks', expected '../windows/hooks.nsh'."
}
Write-Host "OK: windows/hooks.nsh contains all 4 expected ExecWait lines and tauri.conf.json points at it." -ForegroundColor Green

# --- Check 6: Taj override identity fields byte-identical to tauri.conf.json (D-16/D-17) --
if (-not (Test-Path -LiteralPath $TauriOverridePath)) {
    Fail "Taj override file not found at '$TauriOverridePath'."
}
$tajOverride = Get-Content -LiteralPath $TauriOverridePath -Raw | ConvertFrom-Json

$expectedIdentifier = 'com.tajhouseofspices.supermarketpos'
$expectedPublisher = 'Taj House of Spice Supermarket POS'
$expectedEndpoint = 'https://github.com/zedfauji/supermarket-pos/releases/latest/download/latest.json'

if ($tajOverride.identifier -ne $expectedIdentifier) {
    Fail "'$TauriOverridePath' field 'identifier' mismatch: got '$($tajOverride.identifier)', expected '$expectedIdentifier'."
}
if ($tajOverride.bundle.publisher -ne $expectedPublisher) {
    Fail "'$TauriOverridePath' field 'bundle.publisher' mismatch: got '$($tajOverride.bundle.publisher)', expected '$expectedPublisher'."
}
if ($tajOverride.plugins.updater.endpoints[0] -ne $expectedEndpoint) {
    Fail "'$TauriOverridePath' field 'plugins.updater.endpoints[0]' mismatch: got '$($tajOverride.plugins.updater.endpoints[0])', expected '$expectedEndpoint'."
}
Write-Host "OK: Taj's tauri.override.json identity fields (identifier/publisher/updater endpoint) are byte-identical to tauri.conf.json (D-16)." -ForegroundColor Green

Write-Host "All checks passed" -ForegroundColor Green
exit 0
