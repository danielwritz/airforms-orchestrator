import {
  validateTurnRequest,
  validateTurnResponse,
  type TurnRequest,
  type TurnResponse
} from '@airforms/ui-schema'
import { OpenAiResponsesGateway, type LlmGateway } from './llm'
import { InMemoryConversationStore } from './state'
import { resolveTurn } from './turn'

export class HttpValidationError extends Error {
  readonly statusCode: number

  constructor(message: string, statusCode = 400) {
    super(message)
    this.statusCode = statusCode
  }
}

export class OrchestratorService {
  constructor(
    private readonly store: InMemoryConversationStore = new InMemoryConversationStore(),
    private readonly gateway: LlmGateway = new OpenAiResponsesGateway()
  ) {}

  async handleTurn(payload: unknown): Promise<TurnResponse> {
    const validation = validateTurnRequest(payload)
    if (!validation.ok) {
      throw new HttpValidationError('Invalid turn request payload.')
    }

    const request = payload as TurnRequest
    const currentState = this.store.getOrCreate(request.conversationId)
    const response = await resolveTurn(request, currentState, this.gateway)

    const nextValues =
      request.message.type === 'ui_submit'
        ? { ...currentState.values, ...request.message.values }
        : { ...currentState.values }

    this.store.save({
      conversationId: request.conversationId,
      values: nextValues,
      lastFrameId: request.message.type === 'ui_submit' ? request.message.frameId : currentState.lastFrameId
    })

    const responseValidation = validateTurnResponse(response)
    if (!responseValidation.ok) {
      throw new HttpValidationError('Generated response did not match protocol schema.', 500)
    }

    return response
  }
}
