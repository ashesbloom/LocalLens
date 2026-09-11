// `npm run dev` has to serve two things that are served by two different programs: the app
// (vite, with hot reload) and the API in functions/ (wrangler, with the D1 and R2 bindings).
// Running only vite is what made /api/posts answer index.html with a 200 on GET and 404 on
// POST -- the endpoints were simply not there, and the board looked empty rather than broken.
//
// So this starts both and puts them behind one Ctrl-C. vite proxies /api to wrangler
// (vite.config.js), so there is still exactly one URL to open.
//
// No dependency: node's own spawn, and wrangler via npx so package.json keeps its six entries.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

const API_PORT = 8788
const children = []

function run(label, command, args) {
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], env: process.env })
  const tag = (line) => `\x1b[2m[${label}]\x1b[0m ${line}`
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding('utf8')
    let buffer = ''
    stream.on('data', (chunk) => {
      buffer += chunk
      const lines = buffer.split('\n')
      buffer = lines.pop()
      for (const line of lines) if (line.trim()) console.log(tag(line))
    })
  }
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) console.log(tag(`exited with ${code}`))
    stop()
  })
  children.push(child)
  return child
}

let stopping = false
function stop() {
  if (stopping) return
  stopping = true
  for (const child of children) child.kill('SIGTERM')
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)

// wrangler serves the functions out of the built directory named in wrangler.toml. The app
// itself comes from vite, so a stale build here does not matter -- only /api is proxied to it
// -- but the directory has to exist before wrangler will start.
if (!existsSync('dist')) {
  console.log('\x1b[2m[dev]\x1b[0m no dist/ yet, building once so wrangler can start')
  const build = spawn('npx', ['vite', 'build'], { stdio: 'inherit' })
  await new Promise((resolve) => build.on('exit', resolve))
}

if (!existsSync('.wrangler/state')) {
  console.log('\x1b[2m[dev]\x1b[0m no local database yet — run `npm run db:init` if the board 500s')
}

run('api', 'npx', ['--yes', 'wrangler@4', 'pages', 'dev', '--port', String(API_PORT), '--persist-to=.wrangler/state'])
run('app', 'npx', ['vite'])
