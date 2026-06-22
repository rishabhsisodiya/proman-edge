import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import salesRoutes from './routes/sales'
import authRoutes from './routes/auth'
import manufacturingRoutes from './routes/manufacturing'

const app = express()
const PORT = process.env.PORT || 4000

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000' }))
app.use(express.json())

// Request logger
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`)
  next()
})

app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }))

app.use('/api/v1/auth', authRoutes)
app.use('/api/v1/sales', salesRoutes)
app.use('/api/v1/manufacturing', manufacturingRoutes)

app.listen(PORT, () => {
  console.log(`Proman Edge backend running on http://localhost:${PORT}`)

})
