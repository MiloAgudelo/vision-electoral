import express from 'express'

const app = express()
const PORT = process.env.PORT ?? 3000

app.use(express.json())

app.get('/salud', (_req, res) => {
  res.json({ estado: 'ok' })
})

app.listen(PORT, () => {
  console.log(`API corriendo en http://localhost:${PORT}`)
})
