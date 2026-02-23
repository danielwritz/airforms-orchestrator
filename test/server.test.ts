import request from 'supertest'
import { describe, expect, it } from 'vitest'
import type { LlmGateway } from '../src/llm'
import { createApp } from '../src/server'
import { OrchestratorService } from '../src/service'
import { InMemoryConversationStore } from '../src/state'

function createGateway(overrides?: Partial<LlmGateway>): LlmGateway {
  return {
    complete: async () => ({
      assistantText: 'Dynamic assistant response.'
    }),
    ...overrides
  }
}

describe('POST /turn', () => {
  it('returns 400 for invalid request payload', async () => {
    const service = new OrchestratorService(new InMemoryConversationStore(), createGateway())
    const app = createApp(service)

    const response = await request(app).post('/turn').send({
      conversationId: 'c_1',
      message: { type: 'ui_submit', values: {} }
    })

    expect(response.status).toBe(400)
    expect(response.body.error).toContain('Invalid turn request payload')
  })

  it('returns assistant message and frame for user_text', async () => {
    const service = new OrchestratorService(
      new InMemoryConversationStore(),
      createGateway({
        complete: async () => ({
          assistantText: 'Please share details in this form.',
          ui: {
            type: 'ui_frame',
            version: '1.0',
            frameId: 'travel:collect',
            title: 'Travel details',
            state: { values: {} },
            components: [
              { id: 'destination', type: 'text', label: 'Destination', required: true },
              { id: 'budget', type: 'number', label: 'Budget', required: false }
            ],
            primaryAction: { label: 'Continue', action: { type: 'ui_submit' } }
          }
        })
      })
    )
    const app = createApp(service)

    const response = await request(app).post('/turn').send({
      conversationId: 'c_1',
      message: { type: 'user_text', text: 'I want to check my insurance.' }
    })

    expect(response.status).toBe(200)
    expect(response.body.conversationId).toBe('c_1')
    expect(Array.isArray(response.body.messages)).toBe(true)
    expect(response.body.messages[0].type).toBe('assistant_message')
    expect(response.body.messages[0].text).toContain('Please share details')
    expect(response.body.ui?.type).toBe('ui_frame')
    expect(response.body.ui?.primaryAction?.action?.type).toBe('ui_submit')
  })
})
