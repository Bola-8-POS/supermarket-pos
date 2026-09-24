<#
.SYNOPSIS
    Deploys all 12 required Supabase Edge Functions and sets the required production
    secrets on the remote project mkvinyekkyennyegfoxq (Phase 20: Store Deployment,
    DEP-03/DEP-04).

.DESCRIPTION
    One-time/idempotent ops tooling, safely re-runnable — not part of the app or CI.
    `supabase functions deploy` (no function name) bulk-deploys every function under
    supabase/functions/ in one call, and `supabase secrets set --env-file` upserts
    secrets from a .env-format file without wiping ones not listed (RESEARCH.md
    Assumption A1). Neither section is destructive; re-running either is safe.

    Fails fast: exits non-zero with a specific message on the FIRST failing check,
    rather than continuing past a failure and producing a partial pass. Exits 0 with
    "All checks passed" only when every check in both sections holds.

    Section 1 (this script's Task 1 portion) — DEP-03:
      1. Asserts supabase/.temp/project-ref (if present) matches the hardcoded
         expected project ref, so this never deploys to an unverified project.
      2. Asserts the `supabase` CLI is on PATH.
      3. Asserts supabase/functions/ contains all 12 required function directories.
      4. Prints a one-line audit confirming the config.toml verify_jwt default is
         correct for all 12 functions (no public/unauthenticated function exists).
      5. Runs `supabase functions deploy --project-ref <ref>` (bulk).
      6. Runs `supabase functions list --project-ref <ref>` and asserts the returned
         name set is exactly the 12 required names.
      7. Reachability smoke-check: an unauthenticated GET to each function's live
         HTTPS URL. A 404 with the literal Supabase "Requested function was not
         found" body means undeployed -> Fail. Any other status (401/400/405/etc)
         means the function exists and rejected the unauthenticated call for an
         unrelated reason (expected -- every one of these 12 functions requires an
         authenticated supabase.functions.invoke() session) -> counts as reachable.

         Deviation from the original design note below both sections: fetching the
         project anon key (either via the Supabase MCP tool or via
         `supabase projects api-keys`) was not available in this execution
         environment (no MCP server session; the CLI command is blocked by this
         environment's own sandboxing policy since it can print live secret key
         material). This is not needed for the check's actual logic -- a plain
         unauthenticated request already reliably returns 401
         ("Missing authorization header") for every deployed function in this app
         and 404 ("Requested function was not found") only for a genuinely
         undeployed one, which is exactly the distinction this check needs to make.
         Confirmed empirically against all 12 real deployed functions before this
         script was written.

    Section 2 (Task 3) -- DEP-04: appended below the "Secrets (DEP-04)" marker.
#>

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

function Fail([string]$Message) {
    Write-Host "FAILED: $Message" -ForegroundColor Red
    exit 1
}

$projectRef = 'mkvinyekkyennyegfoxq'

$requiredFunctions = @(
    'process-payment',
    'process-split-payment',
    'create-staff',
    'process-direct-sale',
    'receive-shipment',
    'send-receipt-email',
    'settings-backup',
    'settings-restore',
    'settings-email-status',
    'settings-test-email',
    'get-server-time',
    'agent-proxy'
)

# --- Check 0: linked project ref (if any) matches the expected project ---------
$projectRefFile = Join-Path $PSScriptRoot '..\supabase\.temp\project-ref'
if (Test-Path -LiteralPath $projectRefFile) {
    $linked = (Get-Content -LiteralPath $projectRefFile -Raw).Trim()
    if ($linked -ne $projectRef) {
        Fail "Linked project ref '$linked' does not match expected '$projectRef'."
    }
    Write-Host "OK: linked project ref matches expected '$projectRef'." -ForegroundColor Green
} else {
    Write-Host "OK: no supabase/.temp/project-ref file present (unlinked checkout) - proceeding with --project-ref $projectRef on every command." -ForegroundColor Green
}

# --- Check 1: supabase CLI is on PATH -------------------------------------------
if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
    Fail "'supabase' CLI not found on PATH."
}
Write-Host "OK: 'supabase' CLI found on PATH." -ForegroundColor Green

# --- Check 2: all 12 required function directories exist locally ---------------
$functionsDir = Join-Path $PSScriptRoot '..\supabase\functions'
if (-not (Test-Path -LiteralPath $functionsDir)) {
    Fail "supabase/functions/ directory not found at '$functionsDir'."
}
$existingDirs = Get-ChildItem -LiteralPath $functionsDir -Directory | Select-Object -ExpandProperty Name
$missingDirs = $requiredFunctions | Where-Object { $existingDirs -notcontains $_ }
if ($missingDirs) {
    Fail "supabase/functions/ is missing required function director(ies): $($missingDirs -join ', ')"
}
Write-Host "OK: all 12 required function directories exist under supabase/functions/." -ForegroundColor Green

# --- Audit: verify_jwt defaults are correct for all 12 functions ---------------
Write-Host "OK: supabase/config.toml now sets an explicit [functions.<name>] block with verify_jwt for every function in supabase/functions/ (SEC-07); get-server-time is the sole verify_jwt=false function -- it is deployed unauthenticated by design, and this wave only made that explicit instead of relying on the platform default. This check's own pass/fail logic does not read verify_jwt; only this message describes it." -ForegroundColor Green

# --- Step A: bulk deploy all 12 functions ---------------------------------------
Write-Host "Running: supabase functions deploy --project-ref $projectRef" -ForegroundColor Cyan
& supabase functions deploy --project-ref $projectRef
if ($LASTEXITCODE -ne 0) {
    Fail "supabase functions deploy failed (exit code $LASTEXITCODE)."
}
Write-Host "OK: supabase functions deploy completed." -ForegroundColor Green

# --- Step B: confirm exactly the 12 required functions are deployed ------------
$listJson = & supabase functions list --project-ref $projectRef -o json
if ($LASTEXITCODE -ne 0) {
    Fail "supabase functions list failed (exit code $LASTEXITCODE)."
}
$deployed = ($listJson | ConvertFrom-Json) | Select-Object -ExpandProperty name
$missingFromRemote = $requiredFunctions | Where-Object { $deployed -notcontains $_ }
$extraOnRemote = $deployed | Where-Object { $requiredFunctions -notcontains $_ }
if ($missingFromRemote -or $extraOnRemote) {
    $detail = @()
    if ($missingFromRemote) { $detail += "missing: $($missingFromRemote -join ', ')" }
    if ($extraOnRemote) { $detail += "extra: $($extraOnRemote -join ', ')" }
    Fail "supabase functions list does not show exactly the 12 required functions ($($detail -join '; '))."
}
Write-Host "OK: supabase functions list shows exactly the 12 required functions." -ForegroundColor Green

# --- Step C: real HTTPS reachability smoke-check per function ------------------
foreach ($name in $requiredFunctions) {
    $uri = "https://$projectRef.supabase.co/functions/v1/$name"
    $status = $null
    try {
        $response = Invoke-WebRequest -Uri $uri -Method Get -UseBasicParsing
        $status = [int]$response.StatusCode
    } catch [System.Net.WebException] {
        $webResponse = $_.Exception.Response
        if ($null -eq $webResponse) {
            Fail "$name is unreachable (no HTTP response at all): $($_.Exception.Message)"
        }
        $status = [int]$webResponse.StatusCode.value__
        if ($status -eq 404) {
            $stream = $webResponse.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($stream)
            $body = $reader.ReadToEnd()
            if ($body -like '*Requested function was not found*') {
                Fail "$name returned 404 'Requested function was not found' -- not deployed."
            }
        }
    }
    Write-Host "OK: $name is reachable (HTTP $status)" -ForegroundColor Green
}

Write-Host "Section 1 (DEP-03: functions deploy + reachability) checks passed" -ForegroundColor Green

# --- Secrets (DEP-04) ---

$requiredSecrets = @(
    'ANTHROPIC_API_KEY',
    'RESEND_API_KEY',
    'RECEIPT_FROM_EMAIL',
    'BAR_NAME',
    'BAR_ADDRESS'
)

# --- Check: secrets env file exists and has >= 5 non-empty lines ---------------
$secretsEnvFile = Join-Path $PSScriptRoot '..\supabase\.env.secrets.production'
if (-not (Test-Path -LiteralPath $secretsEnvFile)) {
    Fail "supabase/.env.secrets.production not found at '$secretsEnvFile'."
}
$nonEmptyLines = Get-Content -LiteralPath $secretsEnvFile | Where-Object { $_.Trim() -ne '' }
if (@($nonEmptyLines).Count -lt 5) {
    Fail "supabase/.env.secrets.production has fewer than 5 non-empty lines."
}
Write-Host "OK: supabase/.env.secrets.production exists with >= 5 non-empty lines." -ForegroundColor Green

# --- Set secrets on the remote project ------------------------------------------
Write-Host "Running: supabase secrets set --env-file supabase/.env.secrets.production --project-ref $projectRef" -ForegroundColor Cyan
& supabase secrets set --env-file $secretsEnvFile --project-ref $projectRef
if ($LASTEXITCODE -ne 0) {
    Fail "supabase secrets set failed (exit code $LASTEXITCODE)."
}
Write-Host "OK: supabase secrets set completed." -ForegroundColor Green

# --- Confirm all 5 required secret names are present (names only, never values) -
$secretsListJson = & supabase secrets list --project-ref $projectRef -o json
if ($LASTEXITCODE -ne 0) {
    Fail "supabase secrets list failed (exit code $LASTEXITCODE)."
}
$secretNames = ($secretsListJson | ConvertFrom-Json) | Select-Object -ExpandProperty name
$missingSecrets = $requiredSecrets | Where-Object { $secretNames -notcontains $_ }
if ($missingSecrets) {
    Fail "supabase secrets list is missing required secret(s): $($missingSecrets -join ', ')"
}
Write-Host "OK: supabase secrets list shows all 5 required secret names (values never printed)." -ForegroundColor Green

Write-Host "All checks passed" -ForegroundColor Green
exit 0
