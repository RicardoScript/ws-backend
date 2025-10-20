import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { initializeDatabase } from './Models/database.js'
import apiRoutes from './Routes/api.js'

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(cors())
app.use(express.json())

// Routes
app.use('/api', apiRoutes)

// Inicializar base de datos y servidor
async function startServer() {
  try {
    console.log('🔄 Conectando a la base de datos...')
    await initializeDatabase()
    
    app.listen(PORT, () => {
      console.log(`🚀 Servidor backend ejecutándose en http://18.217.24.122:${PORT}`)
      console.log(`📄 API Health: http://18.217.24.122:${PORT}/api/health`)
      console.log(`💾 Base de datos conectada correctamente`)
    })
  } catch (error) {
    console.error('❌ Error al inicializar el servidor:', error)
    process.exit(1)
  }
}

startServer()