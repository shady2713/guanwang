// Tiny static file server for the subdirectory base-path test (T6).
// Serves <root> with SPA-ish fallback: any directory path -> index.html inside it.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.argv[2]
const PORT = Number(process.argv[3] ?? 4180)
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.mp4': 'video/mp4', '.svg': 'image/svg+xml' }

http.createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0])
  let file = path.join(ROOT, url)
  if (!path.resolve(file).startsWith(path.resolve(ROOT))) { res.statusCode = 403; return res.end('forbidden') }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html')
  if (!fs.existsSync(file)) {
    // SPA fallback: /aimaster/demo -> /aimaster/demo/index.html
    const alt = path.join(file, 'index.html')
    if (fs.existsSync(alt)) file = alt
    else { res.statusCode = 404; return res.end('not found: ' + url) }
  }
  const type = TYPES[path.extname(file)] ?? 'application/octet-stream'
  const stat = fs.statSync(file)
  const headers = { 'Content-Type': type, 'Content-Length': stat.size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' }
  const range = req.headers.range
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range)
    const start = m && m[1] ? Number(m[1]) : 0
    const end = m && m[2] ? Number(m[2]) : stat.size - 1
    res.writeHead(206, { ...headers, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${stat.size}` })
    return fs.createReadStream(file, { start, end }).pipe(res)
  }
  res.writeHead(200, headers)
  fs.createReadStream(file).pipe(res)
}).listen(PORT, '127.0.0.1', () => console.log('static server on http://127.0.0.1:' + PORT + '/ serving ' + ROOT))