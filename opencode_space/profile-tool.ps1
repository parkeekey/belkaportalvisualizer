# profile-tool.ps1 — token-efficient profile assistant for windsurf-opencode
# Usage:
#   .\profile-tool.ps1 summary <path>           → compact JSON of key fields
#   .\profile-tool.ps1 edit <source> <out> ...   → modify fields and write new file

param (
  [Parameter(Position=0)][string]$Command,
  [Parameter(Position=1)][string]$SourcePath,
  [Parameter(Position=2)][string]$OutPath,
  [string]$dose,
  [string]$ratio,
  [string]$water,
  [string]$finish,
  [string]$grinder,
  [string]$clicks,
  [string]$micron,
  [string]$pours
)

$ErrorActionPreference = 'Stop'

function Get-ProfileSummary {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { throw "File not found: $Path" }

  $raw = Get-Content -LiteralPath $Path -Raw
  $root = $raw | ConvertFrom-Json
  $dig = $root.digitizer

  # Build a compact summary object with only the fields we care about
  $summary = [PSCustomObject]@{
    version             = $dig.version
    selectedImageName   = $dig.selectedImageName
    currentStep         = $dig.currentStep
    calibrationPoints   = $dig.calibrationPoints
    extractedPointCount = @($dig.extractedPoints).Count
    phaseLogs           = $dig.phaseLogs
    doseWeight          = $dig.doseWeight
    brewRatio           = $dig.brewRatio
    totalWaterIn        = $dig.totalWaterIn
    conversionFactor    = $dig.conversionFactor
    recipeFinishTimeSec = $dig.recipeFinishTimeSec
    pourPlan            = $dig.pourPlan
    grinderName         = $dig.grinderName
    grindSize           = $dig.grindSize
    micron              = $dig.micron
  }

  Write-Output ($summary | ConvertTo-Json -Depth 5)
}

function Edit-Profile {
  param(
    [string]$SourcePath,
    [string]$DestPath,
    [hashtable]$Changes
  )

  $raw = Get-Content -LiteralPath $SourcePath -Raw

  if ($Changes.ContainsKey('dose'))     { $raw = $raw -replace '"doseWeight":\s*[\d.]+',        "`"doseWeight`": $($Changes.dose)" }
  if ($Changes.ContainsKey('ratio'))    { $raw = $raw -replace '"brewRatio":\s*[\d.]+',         "`"brewRatio`": $($Changes.ratio)" }
  if ($Changes.ContainsKey('water'))    { $raw = $raw -replace '"totalWaterIn":\s*[\d.]+',      "`"totalWaterIn`": $($Changes.water)" }
  if ($Changes.ContainsKey('finish'))   { $raw = $raw -replace '"recipeFinishTimeSec":\s*\d+',  "`"recipeFinishTimeSec`": $($Changes.finish)" }
  if ($Changes.ContainsKey('clicks'))   { $raw = $raw -replace '"grindSize":\s*\d+',            "`"grindSize`": $($Changes.clicks)" }
  if ($Changes.ContainsKey('micron'))   { $raw = $raw -replace '"micron":\s*\d+',               "`"micron`": $($Changes.micron)" }
  if ($Changes.ContainsKey('grinder'))  { $raw = $raw -replace '"grinderName":\s*"[^"]*"',      "`"grinderName`": `"$($Changes.grinder)`"" }
  if ($Changes.ContainsKey('pours')) {
    # Find start index of pourPlan array, then find matching closing ]
    $start = $raw.IndexOf('"pourPlan"')
    if ($start -ge 0) {
      $colon = $raw.IndexOf(':', $start + 10)
      $arrStart = $raw.IndexOf('[', $colon)
      if ($arrStart -ge 0) {
        # Track bracket depth to find the matching closing ]
        $depth = 0
        $end = $arrStart
        do {
          $c = $raw[$end]
          if ($c -eq '[') { $depth++ }
          elseif ($c -eq ']') { $depth-- }
          $end++
        } while ($depth -gt 0 -and $end -lt $raw.Length)
        $before = $raw.Substring(0, $arrStart)
        $after  = $raw.Substring($end)
        $raw = $before + $Changes.pours + $after
      }
    }
  }

  # update timestamp
  $now = (Get-Date -Format "yyyy-MM-ddTHH:mm:ss.fffZ")
  $raw = $raw -replace '"savedAt":\s*"[^"]*"', "`"savedAt`": `"$now`""

  Set-Content -LiteralPath $DestPath -Value $raw -Encoding UTF8
  Write-Output "Written: $DestPath"
}

# --- dispatch ---
switch ($Command) {
  'summary' {
    if (-not $SourcePath) { throw "Usage: profile-tool.ps1 summary <path>" }
    Get-ProfileSummary -Path $SourcePath
  }
  'edit' {
    if (-not $SourcePath -or -not $OutPath) { throw "Usage: profile-tool.ps1 edit <source> <out> [...flags]" }
    $changes = @{}
    if ($dose)    { $changes.dose    = $dose }
    if ($ratio)   { $changes.ratio   = $ratio }
    if ($water)   { $changes.water   = $water }
    if ($finish)  { $changes.finish  = $finish }
    if ($grinder) { $changes.grinder = $grinder }
    if ($clicks)  { $changes.clicks  = $clicks }
    if ($micron)  { $changes.micron  = $micron }
    if ($pours)   { $changes.pours   = $pours }
    Edit-Profile -SourcePath $SourcePath -DestPath $OutPath -Changes $changes
  }
  default {
    Write-Output @"
Usage:
  summary <file>    — extract recipe/pour/grinder fields (compact)
  edit <src> <out>  — modify fields and save new profile
    -dose <num>     -ratio <num>      -water <num>
    -finish <num>   -clicks <num>     -micron <num>
    -grinder <str>  -pours <json str>
"@
  }
}
