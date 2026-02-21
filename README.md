# Airforms Chat UI Orchestrator (v0)

This service is the decision engine between:

1. `@airforms/protocol`
2. `@airforms/renderer-react`
3. An LLM (OpenAI or compatible)
4. Optional external tools

It exposes a single API endpoint that:

* Accepts user messages or `ui_submit`
* Decides whether to:

  * Return a normal assistant message
  * Return a `ui_frame`
  * Call a tool
* Persists conversation state
* Returns structured output to the host chat application

This is Layer 3 of the system.

---

# Architecture Overview

```
User Chat UI
    ↓
Client Backend
    ↓
Orchestrator (/turn)
    ↓
LLM (structured output)
    ↓
Tool (optional)
    ↓
Orchestrator response:
  - assistant_message
  - ui_frame
```

The orchestrator never renders UI.
It only returns structured messages.

---

# Responsibilities

The orchestrator:

* Maintains conversation state
* Validates protocol payloads
* Calls the LLM using structured outputs
* Runs the "ask vs proceed" gate
* Routes `ui_submit`
* Optionally calls tools
* Returns protocol-compliant responses

It does NOT:

* Render UI
* Store large amounts of PII long-term (v0 is in-memory)
* Execute arbitrary code

---

# Installation

```bash
npm install
```

Required dependencies:

```bash
npm install express cors dotenv uuid
npm install @airforms/protocol
npm install openai
```

Dev dependencies:

```bash
npm install -D typescript ts-node nodemon @types/express @types/node
```

---

# Environment Variables

Create a `.env` file:

```
OPENAI_API_KEY=your_key_here
PORT=3000
```

---

# Project Structure

```
src/
  server.ts
  turn.ts
  llm.ts
  state.ts
  types.ts
  tools.ts (optional v0 stub)
```

---

# API

## POST /turn

Primary endpoint.

### Request

```json
{
  "conversationId": "c_123",
  "message": {
    "role": "user",
    "text": "I want to check my insurance."
  }
}
```

OR

```json
{
  "conversationId": "c_123",
  "message": {
    "type": "ui_submit",
    "frameId": "insurance:lookup",
    "values": {
      "policyNumber": "ABC123",
      "dob": "1988-07-01"
    }
  }
}
```

---

### Response

```json
{
  "conversationId": "c_123",
  "messages": [
    {
      "type": "assistant_message",
      "text": "Please enter your policy details."
    }
  ],
  "ui": {
    "type": "ui_frame",
    ...
  }
}
```

The `ui` field is optional.

---

# Conversation State (v0)

For now, use in-memory storage:

```ts
Map<string, ConversationState>
```

State must store:

* conversationId
* collected slot values
* last frameId
* message history (optional)

v0 persistence is non-durable.

---

# LLM Integration

The LLM must be constrained to output either:

* `assistant_message`
* `ui_frame`

Use structured outputs with JSON schema validation from `@airforms/protocol`.

The model must NOT output raw HTML.

---

# Ask vs Proceed Logic (v0)

Basic deterministic flow:

1. If incoming message is `ui_submit`

   * Merge values into conversation state
   * Return assistant_message confirming receipt
   * (Optional) Call tool
2. If incoming message is `user`

   * Call LLM
   * If required fields missing → return `ui_frame`
   * Else → return assistant_message

Do not overcomplicate v0.

---

# Example Flow (Insurance)

User:

> I want to check my insurance.

LLM returns:

* assistant_message
* ui_frame (policyNumber + dob)

User submits.

Orchestrator:

* merges values
* returns:

  * assistant_message: "Looking up your policy..."
  * (optional tool call stub)

---

# Tool Integration (v0 Stub)

In v0:

* tools.ts may contain mock functions
* real external tool wiring can come later

Example:

```ts
export async function lookupPolicy(input) {
  return { status: "active", premium: 120 }
}
```

---

# Demo Host (Recommended)

In Replit:

* Add a simple React frontend
* Install `@airforms/renderer-react`
* Render assistant messages + ui_frame
* Send ui_submit back to `/turn`

This repo may include a `/public` demo client if desired, but it is not required.

---

# Minimal Implementation Requirements

The following must exist before considering v0 complete:

* Express server
* POST /turn
* In-memory state store
* LLM call returning structured output
* Ability to return ui_frame
* Ability to accept ui_submit
* Protocol validation before responding

---

# Definition of Done

* End-to-end flow works:

  1. User sends text
  2. Orchestrator returns ui_frame
  3. Renderer renders it
  4. ui_submit sent
  5. Orchestrator returns final assistant_message

* All protocol objects validate using `@airforms/protocol`

---

# Agent Notes (Implementation Instructions)

## Primary Objective

Build the simplest working orchestrator that:

* Imports `@airforms/protocol`
* Validates frames before returning
* Routes `ui_submit`
* Calls LLM with structured outputs
* Maintains in-memory state

## Constraints

* Keep logic small and explicit
* No framework overengineering
* No database in v0
* No auth in v0
* No streaming in v0

## LLM Prompting Rule

The system prompt must instruct the model:

* Output only valid JSON
* Conform to the protocol schema
* Never output HTML
* Choose between assistant_message or ui_frame

## Important

If the LLM returns invalid JSON:

* Reject it
* Log error
* Return safe assistant_message fallback

## Security

* Do not evaluate code
* Do not pass raw user input into eval
* Validate all outgoing protocol objects

---

# Future Extensions (Not v0)

* Durable storage
* Tool registry
* Webhook support
* Multi-step workflows
* Streaming responses
* Auth + multi-tenant
* Rate limiting
* Observability

---

# Vision

The orchestrator transforms chat from:

"LLM generates text"

Into:

"LLM generates structured application state transitions."

This service is the brain that connects language to deterministic UI and structured actions.

