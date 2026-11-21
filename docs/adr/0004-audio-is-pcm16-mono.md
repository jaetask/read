# Audio is PCM16 mono

## Decision

The microphone goes to Read as PCM16 mono at 16 kHz over the `/voice` websocket, and speech comes back as PCM16 mono at 24 kHz. The browser plays the chunks back to back and drops what is queued when Read sends `hush`.

## Consequences

No codec is needed on either side, and stopping is immediate. The websocket needs the same session cookie as the page.

The page creates its AudioContext inside a click, since browsers start audio only from a gesture; speech that arrives before the first click is not played. The capture worklet runs only while connected to the output, so it goes through a muted gain. A short lead-in before the first chunk absorbs network jitter.
