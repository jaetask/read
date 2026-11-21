# Reading commands are resolved before the model

## Context

"Next", "pause", "reread the tools section" and "open the Orca file" are said many times in a reading session. A local model takes seconds to answer and sometimes retells a section instead of reading it.

## Decision

`parseOpen` and `parseCommand` run on every turn first. When one matches, Read invokes the reader's Actions itself and says at most a few words. Only what neither matches, such as a question, goes to the agent. A question that names a section ("what does section six say about Slack?") is never a command.

## Consequences

Commands answer at once and the same way every time, and are covered by tests with no model. The agent still has the reader's Actions as tools for what the patterns miss.
