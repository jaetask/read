# Read runs on this machine without sign-in

## Context

A Kit App signs its page in with a setup secret. For an app that only ever runs on the owner's own machine, the secret was a step that only got in the way.

## Decision

Read listens on a loopback address only and refuses any other `HOST`. At start it makes a secret no one sees, starts a session with it, and adds that session to every page request, so the page opens straight to the files. The voice websocket accepts only a page from the same address. Other Apps still reach `/mcp` through a Connection the owner approves.

## Consequences

There is no sign-in page and no sign-out. Reaching Read from another machine needs a change to this decision first.
