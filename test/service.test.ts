import { describe, expect, it } from 'vitest'
import { validateTurnResponse } from '@airforms/ui-schema'
import type { LlmGateway } from '../src/llm'
import { InMemoryConversationStore } from '../src/state'
import { OrchestratorService } from '../src/service'

function createGateway(overrides?: Partial<LlmGateway>): LlmGateway {
  return {
    complete: async () => ({
      assistantText: 'Dynamic assistant response.'
    }),
    ...overrides
  }
}

describe('OrchestratorService', () => {
  it('rejects invalid user_text payload', async () => {
    const service = new OrchestratorService(new InMemoryConversationStore(), createGateway())

    await expect(
      service.handleTurn({
        conversationId: 'c_1',
        message: { type: 'user_text', text: '' }
      })
    ).rejects.toThrow('Invalid turn request payload.')
  })

  it('rejects invalid ui_submit payload', async () => {
    const service = new OrchestratorService(new InMemoryConversationStore(), createGateway())

    await expect(
      service.handleTurn({
        conversationId: 'c_1',
        message: { type: 'ui_submit', values: {} }
      })
    ).rejects.toThrow('Invalid turn request payload.')
  })

  it('returns schema-valid response for llm_result message', async () => {
    const service = new OrchestratorService(
      new InMemoryConversationStore(),
      createGateway({
        complete: async () => ({
          assistantText: 'Here is what I understood from your model output.'
        })
      })
    )

    const response = await service.handleTurn({
      conversationId: 'c_1',
      message: { type: 'llm_result', text: 'The user asks to compare travel options.' }
    })

    expect(response.messages[0]?.text).toContain('understood')
    expect(validateTurnResponse(response).ok).toBe(true)
  })

  it('returns ui when gateway includes a dynamic frame', async () => {
    const service = new OrchestratorService(
      new InMemoryConversationStore(),
      createGateway({
        complete: async () => ({
          assistantText: 'Please fill in this form.',
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

    const response = await service.handleTurn({
      conversationId: 'c_ui',
      message: { type: 'user_text', text: 'Help me plan a trip.' }
    })

    expect(response.ui?.frameId).toBe('travel:collect')
    expect(validateTurnResponse(response).ok).toBe(true)
  })

  it('returns schema-valid slider components from gateway frames', async () => {
    const service = new OrchestratorService(
      new InMemoryConversationStore(),
      createGateway({
        complete: async () => ({
          assistantText: 'Set your travel urgency.',
          ui: {
            type: 'ui_frame',
            version: '1.0',
            frameId: 'travel:urgency',
            title: 'Travel urgency',
            state: { values: {} },
            components: [{ id: 'urgency', type: 'slider', label: 'Urgency', required: true, min: 1, max: 10, step: 1 }],
            primaryAction: { label: 'Continue', action: { type: 'ui_submit' } }
          }
        })
      })
    )

    const response = await service.handleTurn({
      conversationId: 'c_slider',
      message: { type: 'user_text', text: 'Help me plan quickly.' }
    })

    expect(response.ui?.components[0]?.type).toBe('slider')
    expect(validateTurnResponse(response).ok).toBe(true)
  })

  it('converts number to slider when user explicitly requests a slider', async () => {
    const service = new OrchestratorService(
      new InMemoryConversationStore(),
      createGateway({
        complete: async () => ({
          assistantText: 'Here is your slider form.',
          ui: {
            type: 'ui_frame',
            version: '1.0',
            frameId: 'slider:request',
            title: 'Slider request',
            state: { values: {} },
            components: [{ id: 'urgency', type: 'number', label: 'Urgency', required: true }],
            primaryAction: { label: 'Continue', action: { type: 'ui_submit' } }
          }
        })
      })
    )

    const response = await service.handleTurn({
      conversationId: 'c_slider_fix',
      message: { type: 'user_text', text: 'Give me a form with sliders on it.' }
    })

    const slider = response.ui?.components.find((component) => component.id === 'urgency')
    expect(slider?.type).toBe('slider')
    if (slider?.type === 'slider') {
      expect(slider.min).toBe(0)
      expect(slider.max).toBe(100)
      expect(slider.step).toBe(1)
    }

    const meta = response.messages[0]?.meta as { componentIntent?: { patched?: string[] } } | undefined
    expect(meta?.componentIntent?.patched).toContain('slider')
    expect(validateTurnResponse(response).ok).toBe(true)
  })

  it('converts number to slider for phrase "slider on a scale of 1 to 10"', async () => {
    const service = new OrchestratorService(
      new InMemoryConversationStore(),
      createGateway({
        complete: async () => ({
          assistantText: 'Here is a slider from 1 to 10.',
          ui: {
            type: 'ui_frame',
            version: '1.0',
            frameId: 'slider:scale:request',
            title: 'Slider request',
            state: { values: {} },
            components: [{ id: 'slider1', type: 'number', label: 'Select a value', required: true }],
            primaryAction: { label: 'Submit', action: { type: 'ui_submit' } }
          }
        })
      })
    )

    const response = await service.handleTurn({
      conversationId: 'c_slider_phrase',
      message: { type: 'user_text', text: 'give me a form with a slider on a scale of 1 to 10' }
    })

    const component = response.ui?.components.find((entry) => entry.id === 'slider1')
    expect(component?.type).toBe('slider')
    expect(validateTurnResponse(response).ok).toBe(true)
  })

  it('converts number to slider when assistant text promises slider', async () => {
    const service = new OrchestratorService(
      new InMemoryConversationStore(),
      createGateway({
        complete: async () => ({
          assistantText: "Here's a form with a slider on a scale of 1 to 10.",
          ui: {
            type: 'ui_frame',
            version: '1.0',
            frameId: 'slider:assistant:promise',
            title: 'Slider promise',
            state: { values: {} },
            components: [{ id: 'slider1', type: 'number', label: 'Select a value', required: true }],
            primaryAction: { label: 'Submit', action: { type: 'ui_submit' } }
          }
        })
      })
    )

    const response = await service.handleTurn({
      conversationId: 'c_slider_promise_fix',
      message: { type: 'user_text', text: 'Please make a feedback form.' }
    })

    const component = response.ui?.components.find((entry) => entry.id === 'slider1')
    expect(component?.type).toBe('slider')
    const meta = response.messages[0]?.meta as { componentIntent?: { requested?: string[]; patched?: string[] } } | undefined
    expect(meta?.componentIntent?.requested).toContain('slider')
    expect(meta?.componentIntent?.patched).toContain('slider')
    expect(validateTurnResponse(response).ok).toBe(true)
  })

  it('does not force slider when there is no explicit slider intent', async () => {
    const service = new OrchestratorService(
      new InMemoryConversationStore(),
      createGateway({
        complete: async () => ({
          assistantText: 'Please provide a number.',
          ui: {
            type: 'ui_frame',
            version: '1.0',
            frameId: 'number:normal',
            title: 'Number request',
            state: { values: {} },
            components: [{ id: 'budget', type: 'number', label: 'Budget', required: true }],
            primaryAction: { label: 'Continue', action: { type: 'ui_submit' } }
          }
        })
      })
    )

    const response = await service.handleTurn({
      conversationId: 'c_number_keep',
      message: { type: 'user_text', text: 'Help me plan my trip budget.' }
    })

    const number = response.ui?.components.find((component) => component.id === 'budget')
    expect(number?.type).toBe('number')
    expect(validateTurnResponse(response).ok).toBe(true)
  })

  it('sends ui_submit values to gateway through state transitions', async () => {
    const store = new InMemoryConversationStore()
    const capturedValues: Array<Record<string, unknown>> = []
    const service = new OrchestratorService(
      store,
      createGateway({
        complete: async (input) => {
          capturedValues.push(input.values)
          return {
            assistantText: input.messageType === 'ui_submit' ? 'Submission received.' : 'Please continue.'
          }
        }
      })
    )

    const first = await service.handleTurn({
      conversationId: 'c_2',
      message: { type: 'user_text', text: 'Check my policy' }
    })

    expect(first.messages[0]?.text).toContain('Please continue')

    const second = await service.handleTurn({
      conversationId: 'c_2',
      message: {
        type: 'ui_submit',
        frameId: 'travel:collect',
        values: {
          destination: 'Tokyo',
          budget: 3000
        }
      }
    })

    expect(capturedValues[1]?.destination).toBe('Tokyo')
    expect(second.messages[0]?.text).toContain('Submission received')
    expect(validateTurnResponse(second).ok).toBe(true)
  })

  it('accepts only supported message union entries', async () => {
    const service = new OrchestratorService(new InMemoryConversationStore(), createGateway())

    await expect(
      service.handleTurn({
        conversationId: 'c_3',
        message: {
          type: 'ui_back',
          frameId: 'insurance:lookup'
        }
      })
    ).rejects.toThrow('Invalid turn request payload.')
  })
})
