import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'profile-saver',
      configureServer(server) {
        server.middlewares.use('/api/save-profile', (req, res) => {
          if (req.method !== 'POST') {
            res.statusCode = 405
            res.end('POST only')
            return
          }
          let body = ''
          req.on('data', (chunk) => { body += chunk })
          req.on('end', () => {
            try {
              const data = JSON.parse(body)
              const ts = data.savedAt?.replace(/[:.]/g, '-') || Date.now()
              const filename = `belka-profile-${ts}.json`
              const dir = path.resolve(__dirname, 'profiles')
              if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
              fs.writeFileSync(path.join(dir, filename), JSON.stringify(data, null, 2))
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ ok: true, file: filename }))
            } catch (e) {
              res.statusCode = 500
              res.end(JSON.stringify({ ok: false, error: String(e) }))
            }
          })
        })
      }
    }
  ],
  base: '/belkaportalvisualizer/',
  build: {
    outDir: 'docs',
    assetsDir: 'assets'
  }
})
