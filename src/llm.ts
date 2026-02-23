import type { Component, UiFrame } from '@airforms/ui-schema'
import type { ConversationState } from './types'

export type LlmGatewayInput = {
  conversationId: string
  messageType: 'user_text' | 'llm_result' | 'ui_submit'
  messageText?: string
  formSensitivity?: number
  explicitComponentIntents?: Array<Component['type']>
  values: Record<string, unknown>
  frameId?: string
  state: ConversationState
}

export type LlmGatewayOutput = {
  assistantText: string
  ui?: UiFrame
}

export interface LlmGateway {
  complete(input: LlmGatewayInput): Promise<LlmGatewayOutput>
}

type OpenAiResponsePayload = {
  output_text?: string
  output?: Array<{
    content?: Array<{
      type?: string
      text?: string
    }>
  }>
}

type StructuredField = {
  id: string
  label: string
  type: 'text' | 'textarea' | 'number' | 'date' | 'select' | 'slider' | 'map_pin'
  required?: boolean
  placeholder?: string
  options?: Array<{ label: string; value: string }>
  min?: number
  max?: number
  step?: number
}

type StructuredUi = {
  frameId: string
  title: string
  submitLabel: string
  fields: StructuredField[]
}

type StructuredLlmOutput = {
  assistantText: string
  ui?: StructuredUi
}

export class OpenAiResponsesGateway implements LlmGateway {
  private readonly apiKey?: string
  private readonly model: string

  constructor(apiKey = process.env.OPENAI_API_KEY, model = process.env.OPENAI_MODEL ?? 'gpt-4.1') {
    this.apiKey = apiKey
    this.model = model
  }

  async complete(input: LlmGatewayInput): Promise<LlmGatewayOutput> {
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY is required for orchestrator LLM calls.')
    }

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.model,
        input: [
          {
            role: 'system',
            content: [
              {
                type: 'input_text',
                text:
                  'You are an orchestration engine for a chat UI. Return JSON only with keys: assistantText (string) and optional ui. Only include ui when structured input fields are needed. When ui is needed, prefer a complete but concise form (typically 3-6 fields), if the user asks for a review or indicates a more complex form, attempt to fulfill the request as it was asked, even if it is more than five fields, not a single minimal question. If explicitComponentIntents is present, you must include those component types in ui fields, using the closest valid configuration. Use select for small enumerations and slider for bounded preference/range inputs like budget comfort, urgency, distance, confidence, or flexibility.'
              }
            ]
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: JSON.stringify(input)
              }
            ]
          }
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'airforms_orchestrator_response',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              required: ['assistantText', 'ui'],
              properties: {
                assistantText: { type: 'string', minLength: 1 },
                ui: {
                  anyOf: [
                    { type: 'null' },
                    {
                      type: 'object',
                      additionalProperties: false,
                      required: ['frameId', 'title', 'submitLabel', 'fields'],
                      properties: {
                        frameId: { type: 'string', minLength: 1 },
                        title: { type: 'string', minLength: 1 },
                        submitLabel: { type: 'string', minLength: 1 },
                        fields: {
                          type: 'array',
                          minItems: 1,
                          items: {
                            anyOf: [
                              {
                                type: 'object',
                                additionalProperties: false,
                                required: ['id', 'label', 'type', 'required', 'placeholder'],
                                properties: {
                                  id: { type: 'string', minLength: 1 },
                                  label: { type: 'string', minLength: 1 },
                                  type: { type: 'string', enum: ['text', 'textarea', 'number', 'date'] },
                                  required: { type: 'boolean' },
                                  placeholder: { type: ['string', 'null'] }
                                }
                              },
                              {
                                type: 'object',
                                additionalProperties: false,
                                required: ['id', 'label', 'type', 'required', 'placeholder', 'options'],
                                properties: {
                                  id: { type: 'string', minLength: 1 },
                                  label: { type: 'string', minLength: 1 },
                                  type: { type: 'string', enum: ['select'] },
                                  required: { type: 'boolean' },
                                  placeholder: { type: ['string', 'null'] },
                                  options: {
                                    type: 'array',
                                    minItems: 1,
                                    items: {
                                      type: 'object',
                                      additionalProperties: false,
                                      required: ['label', 'value'],
                                      properties: {
                                        label: { type: 'string', minLength: 1 },
                                        value: { type: 'string', minLength: 1 }
                                      }
                                    }
                                  }
                                }
                              },
                              {
                                type: 'object',
                                additionalProperties: false,
                                required: ['id', 'label', 'type', 'required', 'min', 'max', 'step'],
                                properties: {
                                  id: { type: 'string', minLength: 1 },
                                  label: { type: 'string', minLength: 1 },
                                  type: { type: 'string', enum: ['slider'] },
                                  required: { type: 'boolean' },
                                  min: { type: 'number' },
                                  max: { type: 'number' },
                                  step: { type: 'number', exclusiveMinimum: 0 }
                                }
                              },
                              {
                                type: 'object',
                                additionalProperties: false,
                                required: ['id', 'label', 'type', 'required'],
                                properties: {
                                  id: { type: 'string', minLength: 1 },
                                  label: { type: 'string', minLength: 1 },
                                  type: { type: 'string', enum: ['map_pin'] },
                                  required: { type: 'boolean' }
                                }
                              }
                            ]
                          }
                        }
                      }
                    }
                  ]
                }
              }
            }
          }
        }
      })
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`OpenAI Responses API failed (${response.status}): ${body}`)
    }

    const payload = (await response.json()) as OpenAiResponsePayload
    const outputText = payload.output_text ?? extractOutputText(payload)

    if (!outputText) {
      throw new Error('OpenAI Responses API returned no output_text.')
    }

    const parsed = JSON.parse(outputText) as StructuredLlmOutput
    if (!parsed || typeof parsed.assistantText !== 'string' || parsed.assistantText.trim().length === 0) {
      throw new Error('Invalid structured output from OpenAI Responses API.')
    }

    return {
      assistantText: parsed.assistantText,
      ui: parsed.ui ? mapStructuredUiToFrame(parsed.ui, input.values) : undefined
    }
  }
}

function mapStructuredUiToFrame(ui: StructuredUi, values: Record<string, unknown>): UiFrame {
  return {
    type: 'ui_frame',
    version: '1.0',
    frameId: ui.frameId,
    title: ui.title,
    state: {
      values
    },
    components: ui.fields.map(mapFieldToComponent),
    primaryAction: {
      label: ui.submitLabel,
      action: {
        type: 'ui_submit'
      }
    }
  }
}

function mapFieldToComponent(field: StructuredField): Component {
  if (field.type === 'select') {
    return {
      id: field.id,
      type: 'select',
      label: field.label,
      required: field.required,
      options: field.options ?? []
    }
  }

  if (field.type === 'slider') {
    const min = typeof field.min === 'number' ? field.min : 0
    const max = typeof field.max === 'number' ? field.max : min + 10
    const rawStep = typeof field.step === 'number' ? field.step : 1

    return {
      id: field.id,
      type: 'slider',
      label: field.label,
      required: field.required,
      min,
      max: max >= min ? max : min,
      step: rawStep > 0 ? rawStep : 1
    }
  }

  if (field.type === 'map_pin') {
    return {
      id: field.id,
      type: 'map_pin',
      label: field.label,
      required: field.required
    }
  }

  const component: Component = {
    id: field.id,
    type: field.type,
    label: field.label,
    required: field.required
  }

  if (typeof field.placeholder === 'string') {
    return {
      ...component,
      placeholder: field.placeholder
    }
  }

  return {
    ...component
  }
}

function extractOutputText(payload: OpenAiResponsePayload): string | undefined {
  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === 'output_text' && typeof content.text === 'string') {
        return content.text
      }
    }
  }

  return undefined
}
