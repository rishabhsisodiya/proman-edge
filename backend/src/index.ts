import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import salesRoutes from './routes/sales'
import authRoutes from './routes/auth'
import manufacturingRoutes from './routes/manufacturing'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 4000

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000' }))
app.use(express.json())

app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }))

app.use('/api/v1/auth', authRoutes)
app.use('/api/v1/sales', salesRoutes)
app.use('/api/v1/manufacturing', manufacturingRoutes)

app.listen(PORT, () => {
  console.log(`Proman Edge backend running on http://localhost:${PORT}`)

})
