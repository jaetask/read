# Reading waits for the reply

## Context

The reader and the spoken reply share one voice. When the agent moves the reader during a turn, reading at once would talk over the reply.

## Decision

During a spoken turn the reader holds any read it is asked for. When the reply has been spoken, the last held read starts. When the person talks over the reply, the held read is dropped.

## Consequences

"Read section six" is answered with a few words, then the section. A typed question while the reader is reading is answered in text only, and the reading carries on.
