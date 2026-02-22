import type { TurnRequest, TurnResponse, UiFrame } from '@airforms/ui-schema'

export type { TurnRequest, TurnResponse }

export type ConversationState = {
  conversationId: string
  values: Record<string, unknown>
  lastFrameId?: string
}

export type OrchestratorOutcome = {
  response: TurnResponse
  state: ConversationState
}

export const REQUIRED_INSURANCE_FIELDS = ['policyNumber', 'dob'] as const

export function buildInsuranceLookupFrame(values: Record<string, unknown>): UiFrame {
  return {
    type: 'ui_frame',
    version: '1.0',
    frameId: 'insurance:lookup',
    title: 'Find your policy',
    state: { values },
    components: [
      {
        id: 'policyNumber',
        type: 'text',
        label: 'Policy number',
        required: true,
        placeholder: 'ABC123'
      },
      {
        id: 'dob',
        type: 'date',
        label: 'Date of birth',
        required: true
      }
    ],
    primaryAction: {
      label: 'Look up',
      action: { type: 'ui_submit' }
    }
  }
}
