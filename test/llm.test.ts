import { describe, expect, it, vi } from 'vitest'
import { validateTurnResponse } from '@airforms/ui-schema'
import { OpenAiResponsesGateway } from '../src/llm'

describe('OpenAiResponsesGateway', () => {
  it('normalizes nullable placeholder fields from model output', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          assistantText: 'Please fill this out.',
          ui: {
            frameId: 'f_placeholder',
            title: 'Placeholder normalization',
            submitLabel: 'Continue',
            fields: [
              {
                id: 'name',
                label: 'Name',
                type: 'text',
                required: true,
                placeholder: null
              }
            ]
          }
        })
      })
    })

    vi.stubGlobal('fetch', fetchMock)

    const gateway = new OpenAiResponsesGateway('test-key', 'gpt-4.1-mini')
    const output = await gateway.complete({
      conversationId: 'c_placeholder',
      messageType: 'user_text',
      messageText: 'create a short form',
      values: {},
      state: {
        conversationId: 'c_placeholder',
        values: {},
        lastFrameId: undefined
      }
    })

    const component = output.ui?.components[0]
    expect(component?.type).toBe('text')
    if (component?.type === 'text') {
      expect(component.placeholder).toBeUndefined()
      expect(component.required).toBe(true)
    }

    const validation = validateTurnResponse({
      conversationId: 'c_placeholder',
      messages: [{ type: 'assistant_message', text: output.assistantText }],
      ui: output.ui
    })

    expect(validation.ok).toBe(true)
    vi.unstubAllGlobals()
  })
})
