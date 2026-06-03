import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Manual edits (stage + DQ per deal) persist here, next to the source exports.
const STATE_FILE = path.resolve(__dirname, '..', 'deal_state.json')

// Tiny REST API so the app can read/write deal_state.json with no separate server.
function statePersistence() {
  const readState = () => {
    try { return fs.readFileSync(STATE_FILE, 'utf8') } catch { return '{}' }
  }
  return {
    name: 'state-persistence',
    configureServer(server) {
      server.middlewares.use('/api/state', (req, res) => {
        if (req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json')
          res.end(readState())
          return
        }
        if (req.method === 'POST' || req.method === 'PUT') {
          let body = ''
          req.on('data', c => { body += c })
          req.on('end', () => {
            try {
              const parsed = JSON.parse(body || '{}')
              fs.writeFileSync(STATE_FILE, JSON.stringify(parsed, null, 2))
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ ok: true }))
            } catch (e) {
              res.statusCode = 400
              res.end(JSON.stringify({ ok: false, error: String(e) }))
            }
          })
          return
        }
        res.statusCode = 405
        res.end()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), statePersistence()],
  server: { port: 5173, open: true },
})
