import type { ConversationState } from './types'

export class InMemoryConversationStore {
  private readonly conversations = new Map<string, ConversationState>()

  getOrCreate(conversationId: string): ConversationState {
    const existing = this.conversations.get(conversationId)
    if (existing) {
      return existing
    }

    const created: ConversationState = {
      conversationId,
      values: {}
    }

    this.conversations.set(conversationId, created)
    return created
  }

  save(next: ConversationState): void {
    this.conversations.set(next.conversationId, next)
  }

  clear(): void {
    this.conversations.clear()
  }
}
