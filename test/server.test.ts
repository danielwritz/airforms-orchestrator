import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../src/server'

describe('POST /turn', () => {
  it('returns 400 for invalid request payload', async () => {
    const app = createApp()

    const response = await request(app).post('/turn').send({
      conversationId: 'c_1',
      message: { type: 'ui_submit', values: {} }
    })

    expect(response.status).toBe(400)
    expect(response.body.error).toContain('Invalid turn request payload')
  })

  it('returns assistant message and frame for user_text', async () => {
    const app = createApp()

    const response = await request(app).post('/turn').send({
      conversationId: 'c_1',
      message: { type: 'user_text', text: 'I want to check my insurance.' }
    })

    expect(response.status).toBe(200)
    expect(response.body.conversationId).toBe('c_1')
    expect(Array.isArray(response.body.messages)).toBe(true)
    expect(response.body.messages[0].type).toBe('assistant_message')
    expect(response.body.ui?.type).toBe('ui_frame')
    expect(response.body.ui?.primaryAction?.action?.type).toBe('ui_submit')
  })
})
