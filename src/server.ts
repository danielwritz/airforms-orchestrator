import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import { HttpValidationError, OrchestratorService } from './service'

export function createApp(service = new OrchestratorService()) {
  const app = express()

  app.use(cors())
  app.use(express.json())

  app.post('/turn', async (request, response) => {
    try {
      const payload = await service.handleTurn(request.body)
      response.status(200).json(payload)
    } catch (error) {
      if (error instanceof HttpValidationError) {
        response.status(error.statusCode).json({ error: error.message })
        return
      }

      response.status(500).json({ error: 'Internal server error.' })
    }
  })

  return app
}

if (require.main === module) {
  const app = createApp()
  const port = Number(process.env.PORT ?? 3000)

  app.listen(port, () => {
    process.stdout.write(`airforms-orchestrator listening on :${port}\n`)
  })
}
