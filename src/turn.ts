import type { AssistantMessage, Component, TurnRequest, TurnResponse, UiFrame } from '@airforms/ui-schema'
import type { LlmGateway } from './llm'
import type { ConversationState } from './types'

type SupportedComponentType = Component['type']

type IntentDiagnostics = {
  requested: SupportedComponentType[]
  present: SupportedComponentType[]
  patched: SupportedComponentType[]
  missing: SupportedComponentType[]
  synthesizedUi: boolean
}

const DEFAULT_FORM_SENSITIVITY = 10
const LOW_FORM_SENSITIVITY_THRESHOLD = 2

function buildAssistantMessage(text: string, meta?: Record<string, unknown>): AssistantMessage {
  return {
    type: 'assistant_message',
    text,
    meta
  }
}

function detectRequestedComponents(text?: string): SupportedComponentType[] {
  if (!text) {
    return []
  }

  const lower = text.toLowerCase()
  const found: SupportedComponentType[] = []

  const includes = (pattern: RegExp) => pattern.test(lower)

  if (includes(/\bsliders?\b|\brange\b|\bscale\b/)) found.push('slider')
  if (includes(/\bdropdown\b|\bselect\b|\bchoices?\b/)) found.push('select')
  if (includes(/\bdate\b|\bcalendar\b/)) found.push('date')
  if (includes(/\bnumber\b|\bnumeric\b|\binteger\b/)) found.push('number')
  if (includes(/\btextarea\b|\blong text\b|\bparagraph\b|\bdescription\b/)) found.push('textarea')
  if (includes(/\btext input\b|\btext field\b|\bfree text\b/)) found.push('text')
  if (includes(/\bmap\b|\bpin\b|\blocation\b|\bcoordinates\b/)) found.push('map_pin')
  if (includes(/\breview\b|\bsummary\b/)) found.push('review')

  return Array.from(new Set(found))
}

function mergeRequestedComponents(...groups: SupportedComponentType[][]): SupportedComponentType[] {
  const merged: SupportedComponentType[] = []

  for (const group of groups) {
    for (const type of group) {
      if (!merged.includes(type)) {
        merged.push(type)
      }
    }
  }

  return merged
}

function uniqueId(base: string, existing: Set<string>): string {
  if (!existing.has(base)) {
    return base
  }

  let count = 2
  while (existing.has(`${base}_${count}`)) {
    count += 1
  }

  return `${base}_${count}`
}

function makeRequestedComponent(type: SupportedComponentType, existingIds: Set<string>): Component {
  if (type === 'slider') {
    return {
      id: uniqueId('requested_slider', existingIds),
      type: 'slider',
      label: 'Requested slider',
      required: true,
      min: 0,
      max: 100,
      step: 1
    }
  }

  if (type === 'select') {
    return {
      id: uniqueId('requested_select', existingIds),
      type: 'select',
      label: 'Requested selection',
      required: true,
      options: [
        { label: 'Option A', value: 'option_a' },
        { label: 'Option B', value: 'option_b' }
      ]
    }
  }

  if (type === 'map_pin') {
    return {
      id: uniqueId('requested_location', existingIds),
      type: 'map_pin',
      label: 'Requested location',
      required: true
    }
  }

  if (type === 'review') {
    return {
      id: uniqueId('requested_review', existingIds),
      type: 'review',
      label: 'Requested review'
    }
  }

  return {
    id: uniqueId(`requested_${type}`, existingIds),
    type,
    label: `Requested ${type === 'textarea' ? 'details' : type}`,
    required: true
  }
}

function createRequestedUiFrame(requested: SupportedComponentType[], values: Record<string, unknown>): UiFrame | undefined {
  if (requested.length === 0) {
    return undefined
  }

  const ids = new Set<string>()
  const components = requested.map((type) => {
    const component = makeRequestedComponent(type, ids)
    ids.add(component.id)
    return component
  })

  const nextValues = { ...values }
  for (const component of components) {
    if (component.type === 'slider' && typeof nextValues[component.id] !== 'number') {
      nextValues[component.id] = component.min
    }
  }

  return {
    type: 'ui_frame',
    version: '1.0',
    frameId: 'requested:components',
    title: 'Requested form components',
    state: { values: nextValues },
    components,
    primaryAction: {
      label: 'Continue',
      action: { type: 'ui_submit' }
    }
  }
}

function normalizeFormSensitivity(value?: number): number {
  if (!Number.isInteger(value)) {
    return DEFAULT_FORM_SENSITIVITY
  }

  return Math.min(10, Math.max(1, value))
}

function shouldHardSuppressUi(formSensitivity: number, explicitRequestedComponents: SupportedComponentType[]): boolean {
  if (explicitRequestedComponents.length > 0) {
    return false
  }

  return formSensitivity <= LOW_FORM_SENSITIVITY_THRESHOLD
}

function reconcileRequestedComponents(ui: UiFrame | undefined, requested: SupportedComponentType[]): { ui?: UiFrame; diagnostics: IntentDiagnostics } {
  if (requested.length === 0) {
    return {
      ui,
      diagnostics: {
        requested: [],
        present: [],
        patched: [],
        missing: [],
        synthesizedUi: false
      }
    }
  }

  if (!ui) {
    const synthesized = createRequestedUiFrame(requested, {})
    return {
      ui: synthesized,
      diagnostics: {
        requested,
        present: synthesized?.components.map((component) => component.type) ?? [],
        patched: requested,
        missing: [],
        synthesizedUi: true
      }
    }
  }

  const patchedTypes: SupportedComponentType[] = []
  const components = [...ui.components]
  const existingIds = new Set(components.map((component) => component.id))
  const addComponent = (type: SupportedComponentType) => {
    const component = makeRequestedComponent(type, existingIds)
    existingIds.add(component.id)
    components.push(component)
    patchedTypes.push(type)
  }

  const hasType = (type: SupportedComponentType) => components.some((component) => component.type === type)

  for (const type of requested) {
    if (hasType(type)) {
      continue
    }

    if (type === 'slider') {
      const numberIndex = components.findIndex((component) => component.type === 'number')
      if (numberIndex >= 0) {
        const candidate = components[numberIndex]
        const converted: Component = {
          id: candidate.id,
          type: 'slider',
          label: candidate.label,
          required: candidate.required,
          min: 0,
          max: 100,
          step: 1
        }
        components[numberIndex] = converted
        patchedTypes.push('slider')
        continue
      }
    }

    addComponent(type)
  }

  const present = Array.from(new Set(components.map((component) => component.type)))
  const missing = requested.filter((type) => !present.includes(type))

  const nextValues = { ...ui.state.values }
  for (const component of components) {
    if (component.type === 'slider' && typeof nextValues[component.id] !== 'number') {
      nextValues[component.id] = component.min
    }
  }

  return {
    ui: {
      ...ui,
      state: { values: nextValues },
      components
    },
    diagnostics: {
      requested,
      present,
      patched: Array.from(new Set(patchedTypes)),
      missing,
      synthesizedUi: false
    }
  }
}

export async function resolveTurn(request: TurnRequest, current: ConversationState, gateway: LlmGateway): Promise<TurnResponse> {
  const nextValues =
    request.message.type === 'ui_submit'
      ? { ...current.values, ...request.message.values }
      : { ...current.values }

  const explicitRequestedComponents = detectRequestedComponents(request.message.type === 'ui_submit' ? undefined : request.message.text)
  const formSensitivity = normalizeFormSensitivity(request.formSensitivity)
  const hardSuppressUi = shouldHardSuppressUi(formSensitivity, explicitRequestedComponents)

  try {
    const llmOutput = await gateway.complete({
      conversationId: request.conversationId,
      messageType: request.message.type,
      messageText: request.message.type === 'ui_submit' ? undefined : request.message.text,
      formSensitivity,
      explicitComponentIntents: explicitRequestedComponents,
      frameId: request.message.type === 'ui_submit' ? request.message.frameId : current.lastFrameId,
      values: nextValues,
      state: {
        conversationId: current.conversationId,
        values: nextValues,
        lastFrameId: request.message.type === 'ui_submit' ? request.message.frameId : current.lastFrameId
      }
    })

    const assistantRequestedComponents = hardSuppressUi ? [] : detectRequestedComponents(llmOutput.assistantText)
    const requestedComponents = mergeRequestedComponents(explicitRequestedComponents, assistantRequestedComponents)
    const reconciled = reconcileRequestedComponents(hardSuppressUi ? undefined : llmOutput.ui, requestedComponents)

    return {
      conversationId: request.conversationId,
      messages: [
        buildAssistantMessage(llmOutput.assistantText, {
          componentIntent: reconciled.diagnostics,
          formSensitivity
        })
      ],
      ui: reconciled.ui
    }
  } catch (error) {
    const fallbackUi = createRequestedUiFrame(explicitRequestedComponents, nextValues)

    return {
      conversationId: request.conversationId,
      messages: [
        buildAssistantMessage(
          fallbackUi
            ? 'I ran into an issue generating the full response, but I prepared the requested fields so you can continue.'
            : 'I ran into an issue generating the response right now. Please try again in a moment.',
          {
            llmFallback: true,
            llmError: error instanceof Error ? error.message : String(error),
            formSensitivity,
            componentIntent: {
              requested: explicitRequestedComponents,
              present: fallbackUi?.components.map((component) => component.type) ?? [],
              patched: explicitRequestedComponents,
              missing: [],
              synthesizedUi: Boolean(fallbackUi)
            } satisfies IntentDiagnostics
          }
        )
      ],
      ui: fallbackUi
    }
  }
}
