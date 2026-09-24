# Static file server for SuperBirdCamera lens studio dist/
$ErrorActionPreference = 'Stop'
$port = 8765
$root = (Get-Location).Path
$prefix = "http://127.0.0.1:$port/"

if (-not (Test-Path (Join-Path $root 'index.html'))) {
  Write-Host "ERROR: index.html not found in $root"
  exit 1
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
try {
  $listener.Start()
} catch {
  Write-Host "ERROR: cannot bind $prefix ($($_.Exception.Message))"
  exit 1
}

Write-Host "Listening on $prefix"
Write-Host 'Close this window to stop the server.'

# 首次成功监听后再打开浏览器，避免 run.bat 的 start 竞态
Start-Process $prefix

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
    if (-not $okPath) {
      $okPath = ([IO.Path]::GetFullPath($full) -ieq $rootFull.TrimEnd([IO.Path]::DirectorySeparatorChar))
    }
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
