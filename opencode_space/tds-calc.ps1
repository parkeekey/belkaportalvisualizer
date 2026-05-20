# tds-calc.ps1 — TDS / EY / Ratio calculator using your reference data
# Usage:
#   .\tds-calc.ps1 tds -ratio 15 -ey 20       -> TDS for ratio 1:15 at 20% EY
#   .\tds-calc.ps1 ey -ratio 15 -tds 1.35      -> EY for ratio 1:15 at 1.35% TDS
#   .\tds-calc.ps1 range -ratio 15             -> SCA range (18-22% EY)
#   .\tds-calc.ps1 table -ratio 15             -> full EY->TDS table for that ratio
#   .\tds-calc.ps1 compare -ratio 15 -ey 20    -> reference vs simple formula

param (
  [Parameter(Position=0)][string]$Command,
  [float]$ratio,
  [float]$ey,
  [float]$tds,
  [switch]$json
)

# -- Reference data ---------------------------------------------------
$RATIOS   = @(13,14,15,16,17,18,19,20,21,22,23,24)
$EY_VALS  = @(17,18,19,20,21,22,23,24,25)

$TDS_GRID = @(
  @(1.56,1.57,1.65,1.73,1.80,1.87,1.94,2.01,2.08),
  @(1.45,1.46,1.53,1.60,1.68,1.75,1.83,1.90,1.98),
  @(1.35,1.36,1.40,1.48,1.55,1.65,1.70,1.77,1.85),
  @(1.24,1.25,1.31,1.36,1.45,1.46,1.60,1.68,1.76),
  @(1.15,1.16,1.22,1.28,1.35,1.40,1.50,1.58,1.65),
  @(1.05,1.15,1.20,1.25,1.30,1.37,1.44,1.50,1.56),
  @(1.02,1.03,1.07,1.14,1.18,1.23,1.33,1.40,1.48),
  @(0.96,0.97,1.02,1.07,1.13,1.17,1.28,1.35,1.43),
  @(0.91,0.92,0.97,1.02,1.08,1.12,1.23,1.31,1.38),
  @(0.87,0.88,0.93,0.98,1.03,1.07,1.17,1.25,1.32),
  @(0.84,0.85,0.89,0.94,0.99,1.03,1.12,1.19,1.26),
  @(0.81,0.82,0.86,0.91,0.96,1.00,1.09,1.16,1.23)
)

$NCOLS = $TDS_GRID[0].Count

# -- helpers -----------------------------------------------------------
function Lerp([float]$a,[float]$b,[float]$t) { return $a + ($b-$a)*$t }

function Get-RowAtRatio([float]$ratio) {
  if ($ratio -le $RATIOS[0]) {
    $t = ($ratio - $RATIOS[0]) / ($RATIOS[1] - $RATIOS[0])
    $row = @(0..($NCOLS-1) | ForEach-Object { Lerp $TDS_GRID[0][$_] $TDS_GRID[1][$_] $t })
    return $row
  }
  $last = $RATIOS.Count - 1
  if ($ratio -ge $RATIOS[$last]) {
    $t = ($ratio - $RATIOS[$last-1]) / ($RATIOS[$last] - $RATIOS[$last-1])
    $row = @(0..($NCOLS-1) | ForEach-Object { Lerp $TDS_GRID[$last-1][$_] $TDS_GRID[$last][$_] $t })
    return $row
  }
  for ($i=0; $i -lt $RATIOS.Count-1; $i++) {
    if ($ratio -ge $RATIOS[$i] -and $ratio -le $RATIOS[$i+1]) {
      $t = ($ratio - $RATIOS[$i]) / ($RATIOS[$i+1] - $RATIOS[$i])
      $row = @(0..($NCOLS-1) | ForEach-Object { Lerp $TDS_GRID[$i][$_] $TDS_GRID[$i+1][$_] $t })
      return $row
    }
  }
  return $TDS_GRID[4]
}

function Get-TDS([float]$ratio,[float]$ey) {
  if ($ratio -le 0 -or $ey -le 0) { return 0 }
  $row = Get-RowAtRatio $ratio
  $n = $EY_VALS.Count - 1
  if ($ey -le $EY_VALS[0]) {
    $t = ($ey - $EY_VALS[0]) / ($EY_VALS[1] - $EY_VALS[0])
    return [math]::Round((Lerp $row[0] $row[1] $t), 4)
  }
  if ($ey -ge $EY_VALS[$n]) {
    $t = ($ey - $EY_VALS[$n-1]) / ($EY_VALS[$n] - $EY_VALS[$n-1])
    return [math]::Round((Lerp $row[$n-1] $row[$n] $t), 4)
  }
  for ($j=0; $j -lt $n; $j++) {
    if ($ey -ge $EY_VALS[$j] -and $ey -le $EY_VALS[$j+1]) {
      $t = ($ey - $EY_VALS[$j]) / ($EY_VALS[$j+1] - $EY_VALS[$j])
      return [math]::Round((Lerp $row[$j] $row[$j+1] $t), 4)
    }
  }
  return $row[4]
}

function Get-EY([float]$ratio,[float]$tds) {
  if ($ratio -le 0 -or $tds -le 0) { return 0 }
  $row = Get-RowAtRatio $ratio
  $n = $row.Count - 1
  if ($tds -le $row[0]) {
    $t = ($tds - $row[0]) / ($row[1] - $row[0])
    return [math]::Round((Lerp $EY_VALS[0] $EY_VALS[1] $t), 4)
  }
  if ($tds -ge $row[$n]) {
    $t = ($tds - $row[$n-1]) / ($row[$n] - $row[$n-1])
    return [math]::Round((Lerp $EY_VALS[$n-1] $EY_VALS[$n] $t), 4)
  }
  for ($j=0; $j -lt $n; $j++) {
    if ($tds -ge $row[$j] -and $tds -le $row[$j+1]) {
      $t = ($tds - $row[$j]) / ($row[$j+1] - $row[$j])
      return [math]::Round((Lerp $EY_VALS[$j] $EY_VALS[$j+1] $t), 4)
    }
  }
  return 20
}

# -- commands ----------------------------------------------------------
switch ($Command) {
  'tds' {
    if (-not $ratio -or -not $ey) { throw "Usage: tds-calc.ps1 tds -ratio R -ey E" }
    $r = Get-TDS $ratio $ey
    $f = [math]::Round($ey / $ratio, 4)
    if ($json) {
      Write-Output (@{ ratio=$ratio; ey=$ey; tds_ref=$r; tds_formula=$f } | ConvertTo-Json)
    } else {
      Write-Output ("1:$($ratio) @ $($ey)% EY -> TDS ref: $($r)%  (formula: $($f)%)")
    }
  }
  'ey' {
    if (-not $ratio -or -not $tds) { throw "Usage: tds-calc.ps1 ey -ratio R -tds T" }
    $r = Get-EY $ratio $tds
    $f = [math]::Round($tds * $ratio, 4)
    if ($json) {
      Write-Output (@{ ratio=$ratio; tds=$tds; ey_ref=$r; ey_formula=$f } | ConvertTo-Json)
    } else {
      Write-Output ("1:$($ratio) @ $($tds)% TDS -> EY ref: $($r)%  (formula: $($f)%)")
    }
  }
  'range' {
    if (-not $ratio) { throw "Usage: tds-calc.ps1 range -ratio R" }
    $lo = Get-TDS $ratio 18
    $hi = Get-TDS $ratio 22
    $elo = [math]::Round(18/$ratio,4)
    $ehi = [math]::Round(22/$ratio,4)
    if ($json) {
      Write-Output (@{ ratio=$ratio; sca_tds_ref=@{min=$lo;max=$hi}; sca_tds_formula=@{min=$elo;max=$ehi} } | ConvertTo-Json)
    } else {
      Write-Output ("1:$($ratio) SCA zone (18-22% EY):")
      Write-Output ("  reference: TDS $($lo)-$($hi)%")
      Write-Output ("  formula:   TDS $($elo)-$($ehi)%")
    }
  }
  'table' {
    if (-not $ratio) { throw "Usage: tds-calc.ps1 table -ratio R" }
    $row = Get-RowAtRatio $ratio
    if ($json) {
      $data = @()
      for ($j=0; $j -lt $EY_VALS.Count; $j++) {
        $data += @{ ey=$EY_VALS[$j]; tds_ref=[math]::Round($row[$j],4); tds_formula=[math]::Round($EY_VALS[$j]/$ratio,4) }
      }
      Write-Output (@{ ratio=$ratio; rows=$data } | ConvertTo-Json -Depth 5)
    } else {
      Write-Output ("----------------------------------------------")
      Write-Output ("TDS reference table for 1:$($ratio)")
      Write-Output ("----------------------------------------------")
      for ($j=0; $j -lt $EY_VALS.Count; $j++) {
        $ev = $EY_VALS[$j]
        $rv = [math]::Round($row[$j], 4)
        $fv = [math]::Round($ev / $ratio, 4)
        Write-Output ("  EY $($ev)% -> TDS ref: $($rv)%  |  formula: $($fv)%")
      }
      Write-Output ("----------------------------------------------")
    }
  }
  'compare' {
    if (-not $ratio -or -not $ey) { throw "Usage: tds-calc.ps1 compare -ratio R -ey E" }
    $ref = Get-TDS $ratio $ey
    $formula = [math]::Round($ey / $ratio, 4)
    $diff = [math]::Round($ref - $formula, 4)
    $pct = [math]::Round(($ref/$formula - 1)*100, 1)
    if ($json) {
      Write-Output (@{ ratio=$ratio; ey=$ey; tds_ref=$ref; tds_formula=$formula; diff=$diff; pctHigher=$pct } | ConvertTo-Json)
    } else {
      Write-Output ("1:$($ratio) @ $($ey)% EY:")
      Write-Output ("  reference: $($ref)% TDS")
      Write-Output ("  formula:   $($formula)% TDS")
      Write-Output ("  diff:      +$($diff)%  ($($pct)% higher with reference)")
    }
  }
  default {
    Write-Output @"
Usage: .\tds-calc.ps1 <command> [options]

Commands:
  tds     -ratio R -ey E          TDS for a given ratio + EY
  ey      -ratio R -tds T         EY for a given ratio + TDS
  range   -ratio R                SCA zone (18-22% EY) TDS range
  table   -ratio R                Full EY->TDS table for a ratio
  compare -ratio R -ey E          Compare reference vs simple formula

Options:  -json   output as JSON instead of text

Examples:
  .\tds-calc.ps1 tds -ratio 15 -ey 20
  .\tds-calc.ps1 ey -ratio 8 -tds 2.1
  .\tds-calc.ps1 table -ratio 11.5
  .\tds-calc.ps1 compare -ratio 18 -ey 22 -json
  .\tds-calc.ps1 range -ratio 16
"@
  }
}
