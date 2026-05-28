<#
.SYNOPSIS
  Captures raw Tally XML responses from a running TallyPrime instance so we can
  diagnose edition detection (#134) and the TB/P&L/BS over-gating (#136).

.DESCRIPTION
  Self-contained — needs only Windows PowerShell + a running TallyPrime with the
  XML/HTTP interface enabled on 127.0.0.1:9000. Does NOT need Node, the TallyMCP
  install, or this repo. Sends the EXACT three envelopes the MCP server uses and
  saves each raw response to a timestamped folder on the Desktop.

  It is strictly READ-ONLY (Export/Collection requests only — never Import/alter).

.USAGE
  1. Transfer this file to the Gold-Tally machine (AnyDesk file transfer).
  2. Make sure TallyPrime is open with the company loaded.
  3. Right-click → "Run with PowerShell"  (or:  powershell -ExecutionPolicy Bypass -File capture-tally-fixtures.ps1)
  4. When it finishes, a folder path is printed. Zip that folder and send it back.

.PARAMETER TallyUrl
  Override the Tally endpoint. Default http://127.0.0.1:9000
#>

param(
  [string]$TallyUrl = "http://127.0.0.1:9000"
)

$ErrorActionPreference = "Stop"
$stamp   = Get-Date -Format "yyyyMMdd-HHmmss"
$outDir  = Join-Path ([Environment]::GetFolderPath("Desktop")) "tally-fixtures-$stamp"
New-Item -ItemType Directory -Path $outDir -Force | Out-Null

function Write-Note($msg) { Write-Host "[capture] $msg" }

# Helper: POST an XML envelope, save the raw response + a small meta line.
function Invoke-TallyCapture {
  param(
    [string]$Name,
    [string]$Xml
  )
  $respFile = Join-Path $outDir "$Name.response.xml"
  $reqFile  = Join-Path $outDir "$Name.request.xml"
  Set-Content -Path $reqFile -Value $Xml -Encoding utf8
  Write-Note "POST $Name ..."
  try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Xml)
    $resp = Invoke-WebRequest -Uri $TallyUrl -Method Post -Body $bytes `
              -ContentType "application/xml; charset=utf-8" -TimeoutSec 60 -UseBasicParsing
    $text = $resp.Content
    Set-Content -Path $respFile -Value $text -Encoding utf8
    $len = $text.Length
    Write-Note "  OK  ($len chars) -> $Name.response.xml"
    return $text
  } catch {
    $err = $_.Exception.Message
    Set-Content -Path $respFile -Value "ERROR: $err" -Encoding utf8
    Write-Note "  ERROR: $err"
    return $null
  }
}

# ── 0. Reachability ──────────────────────────────────────────────────────────
Write-Note "Target: $TallyUrl"
Write-Note "Output: $outDir"
Write-Note ""

# ── 1. List of Companies (Collection+TDL form — cross-edition) ───────────────
$listCompaniesXml = @'
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>List of Companies</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <ENCODINGTYPE>UTF8</ENCODINGTYPE>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="List of Companies" ISMODIFY="No">
            <TYPE>Company</TYPE>
            <FETCH>Name,StartingFrom,BooksFrom,FormalName,GSTRegistrationNumber,BaseCurrencySymbol</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>
'@

$companiesResp = Invoke-TallyCapture -Name "1-list-companies" -Xml $listCompaniesXml

# Extract the first company name for the next two probes.
$company = $null
if ($companiesResp) {
  $m = [regex]::Match($companiesResp, '<NAME>(.*?)</NAME>', 'IgnoreCase')
  if (-not $m.Success) {
    $m = [regex]::Match($companiesResp, '<COMPANYNAME>(.*?)</COMPANYNAME>', 'IgnoreCase')
  }
  if (-not $m.Success) {
    $m = [regex]::Match($companiesResp, 'NAME="(.*?)"', 'IgnoreCase')
  }
  if ($m.Success) { $company = $m.Groups[1].Value.Trim() }
}

if (-not $company) {
  Write-Note ""
  Write-Note "Could not auto-detect a company name from the response."
  Write-Note "Enter the EXACT company name as shown in TallyPrime (or press Enter to skip the remaining probes):"
  $company = Read-Host "Company name"
}

if ($company) {
  Write-Note ""
  Write-Note "Using company: '$company'"
  $companyEsc = $company.Replace("&","&amp;").Replace("<","&lt;").Replace('"',"&quot;")

  # ── 2. Edition probe — legacy Trial Balance Report form (the EXACT probe
  #       capability.ts uses to decide gold vs silver). ───────────────────────
  $tbProbeXml = @"
<ENVELOPE>
  <HEADER><VERSION>1</VERSION><TALLYREQUEST>Export Data</TALLYREQUEST><TYPE>Data</TYPE><ID>Trial Balance</ID></HEADER>
  <BODY><DESC><STATICVARIABLES>
    <SVCURRENTCOMPANY>$companyEsc</SVCURRENTCOMPANY>
    <SVEXPORTFORMAT>`$`$SysName:XML</SVEXPORTFORMAT>
  </STATICVARIABLES></DESC></BODY>
</ENVELOPE>
"@
  $tbResp = Invoke-TallyCapture -Name "2-edition-probe-trial-balance" -Xml $tbProbeXml

  # Classify the same way capability.ts does, so we can see if the probe would
  # mislabel this (real Gold) instance as Silver.
  if ($tbResp) {
    $goldStatus = [regex]::IsMatch($tbResp, '<STATUS>\s*1\s*</STATUS>')
    $goldShape  = [regex]::IsMatch($tbResp, '<TBROW|<DSPACCNAME|<LEDGER ', 'IgnoreCase')
    $verdict = if ($goldStatus -and $goldShape) { "GOLD-LIKE (probe would say Gold)" }
               else { "NOT gold-like (probe would FALSE-POSITIVE as Silver) <-- this is the #134 bug if edition is actually Gold" }
    Write-Note "  Edition-probe classification: STATUS=1? $goldStatus  shape-match? $goldShape  => $verdict"
    Add-Content -Path (Join-Path $outDir "2-edition-probe-trial-balance.response.xml") `
      -Value "`n<!-- capture.ps1 verdict: STATUS=1? $goldStatus ; shape-match? $goldShape ; => $verdict -->"
  }

  # ── 3. List of Ledgers WITH ClosingBalance (Collection+TDL — tests whether a
  #       master collection can serve closing balances cross-edition; this is
  #       the data that proves the #136 TB/P&L/BS fix is viable). ─────────────
  $ledgersXml = @"
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>List of Ledgers</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVCURRENTCOMPANY>$companyEsc</SVCURRENTCOMPANY>
        <SVEXPORTFORMAT>`$`$SysName:XML</SVEXPORTFORMAT>
        <ENCODINGTYPE>UTF8</ENCODINGTYPE>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="List of Ledgers" ISMODIFY="No">
            <TYPE>Ledger</TYPE>
            <FETCH>Name,Parent,OpeningBalance,ClosingBalance</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>
"@
  $ledgersResp = Invoke-TallyCapture -Name "3-ledgers-with-closingbalance" -Xml $ledgersXml

  if ($ledgersResp) {
    $hasClosing = [regex]::IsMatch($ledgersResp, '<CLOSINGBALANCE', 'IgnoreCase')
    Write-Note "  Ledger collection returned ClosingBalance? $hasClosing  (if true on a Silver-class probe => #136 fix is viable via master collection)"
    Add-Content -Path (Join-Path $outDir "3-ledgers-with-closingbalance.response.xml") `
      -Value "`n<!-- capture.ps1: ClosingBalance present? $hasClosing -->"
  }
}

# ── Summary ──────────────────────────────────────────────────────────────────
Write-Note ""
Write-Note "DONE. Captured files in:"
Write-Note "  $outDir"
Write-Note ""
Write-Note "Next: zip that folder and send it back. It contains the raw Tally"
Write-Note "responses needed to fix edition detection (#134) and TB/P&L/BS"
Write-Note "over-gating (#136). No data leaves this machine until you send the zip."
Write-Host ""
Write-Host "Press Enter to close..."
[void](Read-Host)
