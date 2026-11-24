import { defineConfig, type Plugin } from 'vite'
import preact from '@preact/preset-vite'
import { cpSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, normalize, relative, sep } from 'node:path'

// Serves the repository's /db folder in development and copies it into the build,
// so the databases stay at the repository root (SPEC §3.1).
// It also generates db/files.json, the list of every database file, so nobody has to maintain it by hand.
function listFiles(root: string): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      // Each database's tags.json describes its tags; it is not a file of positions.
      else if (name.endsWith('.json') && dir !== root && name !== 'tags.json') out.push(relative(root, full).split(sep).join('/'))
    }
  }
  walk(root)
  return out
}

function databases(): Plugin {
  const root = join(__dirname, 'db')
  return {
    name: 'databases',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0]
        const m = url.match(/\/db\/(.+)$/)
        if (!m) return next()
        if (m[1] === 'files.json') {
          res.setHeader('Content-Type', 'application/json')
          return res.end(JSON.stringify(listFiles(root)))
        }
        const file = normalize(join(root, decodeURIComponent(m[1])))
        if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) return next()
        res.end(readFileSync(file))
      })
    },
    closeBundle() {
      const out = join(__dirname, 'dist', 'db')
      cpSync(root, out, { recursive: true })
      writeFileSync(join(out, 'files.json'), JSON.stringify(listFiles(root)))
    },
  }
}

export default defineConfig({
  // BASE_PATH is set by the pull request preview workflow, e.g. /baduk-notebook/pr-preview/pr-7/
  base: process.env.BASE_PATH || '/baduk-notebook/',
  plugins: [preact(), databases()],
  test: { include: ['src/**/*.test.ts'] },
  resolve: {
    // @sabaki/sgf falls back to UTF-8 when these optional modules are missing; we only use UTF-8 files.
    alias: {
      'iconv-lite': join(__dirname, 'src/types/empty.cjs'),
      jschardet: join(__dirname, 'src/types/empty.cjs'),
    },
  },
})
