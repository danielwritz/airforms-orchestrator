import { describe, expect, it } from 'vitest'
import { validateTurnResponse } from '@airforms/ui-schema'
import { InMemoryConversationStore } from '../src/state'
import { OrchestratorService } from '../src/service'

describe('OrchestratorService', () => {
  it('rejects invalid user_text payload', () => {
    const service = new OrchestratorService(new InMemoryConversationStore())

    expect(() =>
      service.handleTurn({
        conversationId: 'c_1',
        message: { type: 'user_text', text: '' }
      })
    ).toThrow('Invalid turn request payload.')
  })

  it('rejects invalid ui_submit payload', () => {
    const service = new OrchestratorService(new InMemoryConversationStore())

    expect(() =>
      service.handleTurn({
        conversationId: 'c_1',
        message: { type: 'ui_submit', values: {} }
      })
    ).toThrow('Invalid turn request payload.')
  })

  it('returns schema-valid response for user_text needing a frame', () => {
    const service = new OrchestratorService(new InMemoryConversationStore())

    const response = service.handleTurn({
      conversationId: 'c_1',
      message: { type: 'user_text', text: 'I want to check my policy.' }
    })

    expect(response.ui?.type).toBe('ui_frame')
    expect(validateTurnResponse(response).ok).toBe(true)
  })

  it('transitions from user_text to ui_submit completion path', () => {
    const store = new InMemoryConversationStore()
    const service = new OrchestratorService(store)

    const first = service.handleTurn({
      conversationId: 'c_2',
      message: { type: 'user_text', text: 'Check my policy' }
    })

    expect(first.ui?.frameId).toBe('insurance:lookup')

    const second = service.handleTurn({
      conversationId: 'c_2',
      message: {
        type: 'ui_submit',
        frameId: 'insurance:lookup',
        values: {
          policyNumber: 'ABC123',
          dob: '1988-07-01'
        }
      }
    })

    expect(second.ui).toBeUndefined()
    expect(second.messages[0]?.text).toContain('Looking up your policy')
    expect(validateTurnResponse(second).ok).toBe(true)
  })

  it('accepts only ui_submit action in turn message union', () => {
    const service = new OrchestratorService(new InMemoryConversationStore())

    expect(() =>
      service.handleTurn({
        conversationId: 'c_3',
        message: {
          type: 'ui_back',
          frameId: 'insurance:lookup'
        }
      })
    ).toThrow('Invalid turn request payload.')
  })
})
