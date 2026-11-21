# The voice agent runs on pi-durable directly

## Context

The Kit's agent Runtime gives a finished reply per turn. A spoken answer needs the reply sentence by sentence as it is written, a way to stop it when the person talks over it, and the open file's text in the prompt on every turn.

## Decision

Read is a Kit App for its data, its Actions, its MCP Contract and its page. Its agent is a pi-durable conversation per file, opened by Read itself, with one prompt section holding the open file and one tool per reader Action. The tools invoke the Actions through the Call pipeline as the Caller `agent`.

## Consequences

Replies are spoken as they are written and stop on barge-in. Every change the agent makes still passes through the pipeline and is recorded. The model is read from `KIT_MODEL` and `KIT_OPENAI_BASE_URL` with the Kit's own helper.
