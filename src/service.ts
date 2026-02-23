import {
  validateTurnRequest,
  validateTurnResponse,
  type AssistantMessage,
  type TurnRequest,
  type TurnResponse
} from '@airforms/ui-schema'
import { OpenAiResponsesGateway, type LlmGateway } from './llm'
import { InMemoryConversationStore } from './state'
import { resolveTurn } from './turn'

function buildProtocolFallbackResponse(response: TurnResponse, conversationId: string): TurnResponse {
  const assistantText =
    typeof response?.messages?.[0]?.text === 'string' && response.messages[0].text.trim().length > 0
      ? response.messages[0].text
      : 'I had trouble formatting that form response, but I can continue in chat. Please try again.'

  const fallbackMessage: AssistantMessage = {
    type: 'assistant_message',
    text: assistantText,
    meta: {
      protocolFallback: true
    }
  }

  return {
    conversationId,
    messages: [fallbackMessage]
  }
}

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
      return buildProtocolFallbackResponse(response, request.conversationId)
    }

    return response
  }
}
