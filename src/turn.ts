import type { AssistantMessage, TurnRequest, TurnResponse } from '@airforms/ui-schema'
import { buildInsuranceLookupFrame, REQUIRED_INSURANCE_FIELDS, type ConversationState } from './types'

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function hasRequiredInsuranceFields(values: Record<string, unknown>): boolean {
  return REQUIRED_INSURANCE_FIELDS.every((field) => hasNonEmptyString(values[field]))
}

function assistantMessage(text: string): AssistantMessage {
  return {
    type: 'assistant_message',
    text
  }
}

export function resolveTurn(request: TurnRequest, current: ConversationState): TurnResponse {
  const nextValues =
    request.message.type === 'ui_submit'
      ? { ...current.values, ...request.message.values }
      : { ...current.values }

  const nextState: ConversationState = {
    conversationId: current.conversationId,
    values: nextValues,
    lastFrameId: request.message.type === 'ui_submit' ? request.message.frameId : current.lastFrameId
  }

  const complete = hasRequiredInsuranceFields(nextState.values)

  if (!complete) {
    return {
      conversationId: request.conversationId,
      messages: [assistantMessage('Please enter your policy details.')],
      ui: buildInsuranceLookupFrame(nextState.values)
    }
  }

  return {
    conversationId: request.conversationId,
    messages: [assistantMessage('Looking up your policy...')]
  }
}
