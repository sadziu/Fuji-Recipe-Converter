# Serves this folder on http://localhost:<port>/ and opens it in your browser.
# Uses only what ships with Windows. Reachable from this computer only.
param([int]$Port = 8173, [switch]$NoBrowser)

$root = [System.IO.Path]::GetFullPath($PSScriptRoot)
$types = @{
  '.html' = 'text/html; charset=utf-8'; '.css' = 'text/css; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'; '.svg' = 'image/svg+xml'; '.png' = 'image/png'; '.jpg' = 'image/jpeg'
  '.wasm' = 'application/wasm'; '.gz' = 'application/gzip'; '.md' = 'text/plain; charset=utf-8'; '.txt' = 'text/plain; charset=utf-8'
}

$listener = $null
foreach ($p in $Port..($Port + 20)) {
  $candidate = New-Object System.Net.HttpListener
  $candidate.Prefixes.Add("http://localhost:$p/")
  try { $candidate.Start(); $listener = $candidate; $Port = $p; break } catch { $candidate.Close() }
}
if (-not $listener) { Write-Host "Could not find a free port between $Port and $($Port + 20)."; exit 1 }

$url = "http://localhost:$Port/"
Write-Host ""
Write-Host "  Fuji Recipe Converter is running at $url"
Write-Host "  Keep this window open while you use the app. Press Ctrl+C or close it to stop."
Write-Host ""
if (-not $NoBrowser) { Start-Process $url }

try {
  while ($listener.IsListening) {
    $task = $listener.GetContextAsync()
    while (-not $task.AsyncWaitHandle.WaitOne(250)) { }   # stay responsive to Ctrl+C
    $ctx = $task.GetAwaiter().GetResult()
    $res = $ctx.Response
    try {
      $rel = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
      if ($rel -eq '') { $rel = 'index.html' }
      $path = [System.IO.Path]::GetFullPath((Join-Path $root $rel))
      $inside = $path.StartsWith($root + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)
      if ($ctx.Request.HttpMethod -ne 'GET' -and $ctx.Request.HttpMethod -ne 'HEAD') {
        $res.StatusCode = 405
      } elseif (-not $inside -or -not [System.IO.File]::Exists($path) -or $rel -match '(^|/)\.') {
        $res.StatusCode = 404
      } else {
        $ext = [System.IO.Path]::GetExtension($path).ToLowerInvariant()
        $res.ContentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' }
        $res.Headers['Cache-Control'] = 'no-cache'
        $res.Headers['X-Content-Type-Options'] = 'nosniff'
        $bytes = [System.IO.File]::ReadAllBytes($path)
        $res.ContentLength64 = $bytes.Length
        if ($ctx.Request.HttpMethod -eq 'GET') { $res.OutputStream.Write($bytes, 0, $bytes.Length) }
      }
    } catch {
      try { $res.StatusCode = 500 } catch { }
    } finally {
      try { $res.Close() } catch { }
    }
  }
} finally {
  $listener.Stop()
  $listener.Close()
}
