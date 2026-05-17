import express from 'express'

const app = express()
const PORT = process.env.PORT ?? 3000

app.use(express.json())

app.get('/salud', (_req, res) => {
  res.json({ estado: 'ok' })
})

// En desarrollo local corre con su propio servidor;
// en Vercel el runtime de Node importa el módulo directamente.
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`API corriendo en http://localhost:${PORT}`)
  })
}

export default app
