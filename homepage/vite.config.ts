import { defineConfig, type Plugin } from 'vite'
import fs from 'node:fs'
import path from 'node:path'

const DATA_DIR = 'data'

function isInside(child: string, parent: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child))
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

function copyTree(from: string, to: string): void {
  if (!fs.existsSync(from)) return
  fs.mkdirSync(to, { recursive: true })
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name)
    const dst = path.join(to, entry.name)
    if (entry.isDirectory()) copyTree(src, dst)
    else fs.copyFileSync(src, dst)
  }
}

/**
 * The handoff content + analysis JSON lives in <root>/data so that the
 * calibration tooling and the site read exactly the same files.
 * Dev: served from /data/*. Build: copied to dist/data/*.
 */
function handoffData(): Plugin {
  const root = process.cwd()
  return {
    name: 'handoff-data-dir',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const raw = (req.url ?? '').split('?')[0] ?? ''
        if (!raw.startsWith('/data/')) return next()
        const file = path.join(root, decodeURIComponent(raw))
        if (!isInside(file, path.join(root, DATA_DIR))) {
          res.statusCode = 403
          return res.end('forbidden')
        }
        if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
          res.statusCode = 404
          return res.end('not found')
        }
        res.setHeader('Content-Type', file.endsWith('.json') ? 'application/json; charset=utf-8' : 'application/octet-stream')
        res.setHeader('Cache-Control', 'no-cache')
        fs.createReadStream(file).pipe(res)
      })
    },
    closeBundle() {
      copyTree(path.join(root, DATA_DIR), path.join(root, 'dist', DATA_DIR))
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [handoffData()],
  build: {
    outDir: 'dist',
    assetsInlineLimit: 2048,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        demo: path.resolve(__dirname, 'demo/index.html'),
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5178,
  },
  preview: {
    host: '127.0.0.1',
    port: 4178,
  },
})
