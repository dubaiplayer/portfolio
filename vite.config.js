import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react-swc'

/**
 * Dev-only shim that mounts the Vercel functions in api/ onto the Vite dev
 * server, so `yarn dev` alone runs the whole app.
 *
 * Why not `vercel dev`: the Vercel CLI isn't a dependency here, it's noticeably
 * slower, and it degrades the React HMR you use constantly. This keeps one
 * command.
 *
 * Two things Vercel does that Vite does not, both of which the handler assumes:
 *   - req.body  — Vercel parses application/json for you; Vite hands you a raw stream
 *   - res.status()/res.json() — Vercel's helpers, absent on a bare ServerResponse
 *
 * This is an EMULATION and can drift from production on header and body
 * handling. Validate against a Vercel preview deployment before trusting it.
 */
function apiDevServer(env) {
  return {
    name: 'api-dev-server',
    apply: 'serve',
    configureServer(server) {
      // Secrets must NOT be prefixed VITE_ — that would inline them into the
      // client bundle. loadEnv with an empty prefix reads everything, and we
      // put it on process.env where the handler expects it.
      for (const [k, v] of Object.entries(env)) {
        if (!k.startsWith('VITE_') && process.env[k] === undefined) process.env[k] = v
      }

      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next()

        const route = req.url.split('?')[0].replace(/^\/api\//, '').replace(/\/$/, '')
        if (!/^[a-z0-9_-]+$/i.test(route)) return next()

        // Vercel's res helpers.
        res.status = (code) => {
          res.statusCode = code
          return res
        }
        res.json = (obj) => {
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify(obj))
          return res
        }

        // Vercel's JSON body parsing.
        if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
          const chunks = []
          for await (const c of req) chunks.push(c)
          const raw = Buffer.concat(chunks).toString('utf8')
          req.headers['content-length'] = String(Buffer.byteLength(raw))
          try {
            req.body = raw ? JSON.parse(raw) : {}
          } catch {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            return res.end(JSON.stringify({ error: 'Invalid JSON.' }))
          }
        }

        try {
          // Re-imported per request with a cache-busting query so editing a
          // handler doesn't require restarting the dev server.
          const mod = await server.ssrLoadModule(`/api/${route}.js`)
          await mod.default(req, res)
        } catch (err) {
          server.config.logger.error(`[api] ${route}: ${err.stack || err.message}`)
          if (!res.headersSent) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: String(err.message) }))
          }
        }
      })
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), apiDevServer(env)],
  }
})
