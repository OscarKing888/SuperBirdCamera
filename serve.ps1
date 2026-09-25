# SuperBirdCamera lens studio — static server (localhost + LAN + public IP)
$ErrorActionPreference = 'Stop'
$root = (Get-Location).Path
$basePort = 8765
$maxTry = 12

if (-not (Test-Path (Join-Path $root 'index.html'))) {
  Write-Host "ERROR: index.html not found in $root"
  exit 1
}

function Get-LocalIPv4 {
  $ips = @()
  try {
    $ips += Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
      Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
      ForEach-Object { $_.IPAddress }
  } catch { }
  if (-not $ips) {
    try {
      $ips += [System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) |
        Where-Object { $_.AddressFamily -eq 'InterNetwork' -and $_.ToString() -notlike '127.*' } |
        ForEach-Object { $_.ToString() }
    } catch { }
  }
  return @($ips | Select-Object -Unique)
}

function Get-PublicIPv4 {
  foreach ($url in @('https://api.ipify.org', 'https://ifconfig.me/ip', 'http://ip.42.pl/raw')) {
    try {
      $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 4
      $ip = ($r.Content | Out-String).Trim()
      if ($ip -match '^\d{1,3}(\.\d{1,3}){3}$') { return $ip }
    } catch { }
  }
  return $null
}

$localIps = Get-LocalIPv4
$publicIp = Get-PublicIPv4

$listener = $null
$boundPort = $null
$boundPrefixes = @()

for ($i = 0; $i -lt $maxTry; $i++) {
  $port = $basePort + $i
  $prefixes = New-Object System.Collections.Generic.List[string]
  # 全接口优先（需管理员或已授权 URL ACL）；失败则退回 IP 前缀
  $prefixes.Add("http://+:$port/")
  $prefixes.Add("http://127.0.0.1:$port/")
  foreach ($ip in $localIps) {
    $prefixes.Add("http://${ip}:$port/")
  }

  $l = New-Object System.Net.HttpListener
  $added = $false
  foreach ($p in $prefixes) {
    try {
      $l.Prefixes.Add($p)
      $added = $true
    } catch { }
  }
  if (-not $added) {
    try { $l.Close() } catch { }
    continue
  }

  try {
    $l.Start()
    $listener = $l
    $boundPort = $port
    $boundPrefixes = @($l.Prefixes)
    break
  } catch {
    try { $l.Close() } catch { }
    Write-Host "Port $port not available, trying next..."
  }
}

# 若 + 前缀导致整体绑定失败，只绑定 127.0.0.1 + 本机 IP
if (-not $listener) {
  for ($i = 0; $i -lt $maxTry; $i++) {
    $port = $basePort + $i
    $l = New-Object System.Net.HttpListener
    $ok = $true
    try {
      $l.Prefixes.Add("http://127.0.0.1:$port/")
      foreach ($ip in $localIps) { $l.Prefixes.Add("http://${ip}:$port/") }
      $l.Start()
      $listener = $l
      $boundPort = $port
      $boundPrefixes = @($l.Prefixes)
      break
    } catch {
      $ok = $false
      try { $l.Close() } catch { }
      Write-Host "Port $port busy, trying next..."
    }
  }
}

if (-not $listener) {
  Write-Host "ERROR: no free port in $basePort..$($basePort + $maxTry - 1)."
  Write-Host 'Close other SuperBirdCamera run.bat windows, or run as Administrator, then retry.'
  exit 1
}

function UrlFor([string]$ip) {
  return "http://$ip`:$boundPort/"
}

Write-Host ''
Write-Host '==== SuperBirdCamera lens studio ===='
Write-Host ("Port: {0}" -f $boundPort)
foreach ($p in $boundPrefixes) { Write-Host ("Bind: {0}" -f $p) }
Write-Host ''
Write-Host 'Access URLs:'
Write-Host ("  Local:    {0}" -f (UrlFor '127.0.0.1'))
foreach ($ip in $localIps) {
  Write-Host ("  LAN:      {0}" -f (UrlFor $ip))
}
if ($publicIp) {
  Write-Host ("  Public:   {0}" -f (UrlFor $publicIp))
  Write-Host '  Note: cloud security group / Windows Firewall must allow inbound TCP ' -NoNewline
  Write-Host ("{0}" -f $boundPort)
} else {
  Write-Host '  Public:   (not detected — open the LAN URL from your PC, or check firewall)'
}
Write-Host ''
Write-Host 'Close this window to stop the server.'

# 浏览器优先打开公网 / 局域网地址，便于手机与外网访问
$openUrl = UrlFor '127.0.0.1'
if ($publicIp) { $openUrl = UrlFor $publicIp }
elseif ($localIps.Count -gt 0) { $openUrl = UrlFor $localIps[0] }
try { Start-Process $openUrl } catch {
  try { Start-Process (UrlFor '127.0.0.1') } catch { }
}

while ($true) {
  $ctx = $listener.GetContext()
  try {
    $rel = $ctx.Request.Url.LocalPath.TrimStart('/', '\')
    if ([string]::IsNullOrWhiteSpace($rel)) { $rel = 'index.html' }
    $rel = $rel.Replace('/', [IO.Path]::DirectorySeparatorChar)
    $full = [IO.Path]::GetFullPath((Join-Path $root $rel))
    $rootFull = [IO.Path]::GetFullPath($root)
    if (-not $rootFull.EndsWith([IO.Path]::DirectorySeparatorChar)) {
      $rootFull += [IO.Path]::DirectorySeparatorChar
    }
    $okPath = $full.StartsWith($rootFull, [StringComparison]::OrdinalIgnoreCase)
    if ($okPath -and (Test-Path -LiteralPath $full -PathType Leaf)) {
      $bytes = [IO.File]::ReadAllBytes($full)
      $ext = [IO.Path]::GetExtension($full).ToLowerInvariant()
      $ctype = 'application/octet-stream'
      switch ($ext) {
        '.html'  { $ctype = 'text/html; charset=utf-8' }
        '.js'    { $ctype = 'text/javascript; charset=utf-8' }
        '.css'   { $ctype = 'text/css; charset=utf-8' }
        '.json'  { $ctype = 'application/json' }
        '.map'   { $ctype = 'application/json' }
        '.png'   { $ctype = 'image/png' }
        '.jpg'   { $ctype = 'image/jpeg' }
        '.svg'   { $ctype = 'image/svg+xml' }
        '.ico'   { $ctype = 'image/x-icon' }
        '.woff2' { $ctype = 'font/woff2' }
      }
      $ctx.Response.ContentType = $ctype
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
    }
  } catch {
    try { $ctx.Response.StatusCode = 500 } catch { }
  } finally {
    try { $ctx.Response.Close() } catch { }
  }
}
