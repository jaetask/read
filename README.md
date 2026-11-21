# Read

Files read aloud together.

The library's folders and files are on the left. Open one and it shows in the middle, split into sections. Read reads it aloud sentence by sentence and highlights the sentence being heard. Talk to it while it reads: "pause", "next", "reread the tools section", "go to number six", or ask a question such as "explain that like I'm five", and it answers from the file.

**[Read the user guide](https://jaetask.github.io/read/)** (source: [`docs/index.html`](docs/index.html))

## What it is

- **A library of files.** Markdown, plain text and PDF files in a folder and its subfolders. Make folders, drag files into them, rename and move them from the sidebar; a file keeps its place and conversation when it moves. A Markdown file is split by its headings, a PDF by its pages.
- **Read aloud.** One section after another, in the voice you set, with the sentence being heard highlighted. Each file keeps its place.
- **Steered by voice or typing.** Reading commands ("next", "pause", "carry on", "reread what it is", "open the Orca file") act at once, without a model.
- **Questions answered from the file.** Anything else goes to the agent, which answers from the open file's text in a few spoken sentences and stops when you talk over it.
- **Built for other Apps.** The library and the reader are Actions, served over MCP, so another App can open a file, move the reader or look something up.

The words above are defined in the [glossary](GLOSSARY.md).

## How it is built

Read is an App on [open-agent-kit](https://github.com/jaetask/open-agent-kit): every caller reaches the reader through one Call pipeline, and its places, turns and Calls live in one SQLite file. The page is built from [@jaetask/toolkit](https://github.com/jaetask/toolkit). The agent is a [pi-durable](https://github.com/earendil-works/pi) conversation per file ([ADR 0002](docs/adr/0002-the-voice-agent-runs-on-pi-durable-directly.md)).

```
src/files/       the library, sections, PDF text, and the reading commands
src/reader/      the reader (reading aloud, places) and its Domain of Actions
src/brain.ts     a turn: reading commands first, then the agent
src/agent.ts     the agent: a pi-durable conversation per file
src/voice/       the voice loop: turn detection, speech to text, speech, barge-in
page/            the page
```

## Run it

```
npm install
npm run build
npm start
```

Read runs at http://127.0.0.1:3940 and keeps its data in `data/`. At first start it prints a setup secret once: enter it on the page to sign in.

It needs a speech server with Whisper and Kokoro for voice (an OpenAI-compatible `/v1/audio` API and Kokoro's `/ws/tts` websocket), and a model for questions.

| Setting                                   | Default                       | What it does                                                                    |
| ----------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------- |
| `PORT`, `HOST`                            | `3940`, `127.0.0.1`           | Where Read listens                                                              |
| `DATA_DIR`                                | `data`                        | The App database and the agent's conversations                                  |
| `READ_FILES_DIR`                          | `DATA_DIR/files`              | The library                                                                     |
| `KIT_SETUP_SECRET`                        | made at first start           | The secret for signing in                                                       |
| `KIT_MODEL`                               | none                          | The model, as `provider/model`; `local/<model>` with `KIT_OPENAI_BASE_URL`      |
| `KIT_OPENAI_BASE_URL`                     | none                          | An OpenAI-compatible model server, such as Ollama's `http://127.0.0.1:11434/v1` |
| `VOICESTUDIO_URL`                         | `http://127.0.0.1:3900`       | The speech server                                                               |
| `READ_TTS`                                | `kokoro`                      | `kokoro` streams over the websocket; `kokoro-http` uses `/v1/audio/speech`      |
| `READ_VOICE`, `READ_SPEED`, `READ_GAP_MS` | server default, `0.94`, `250` | The voice, its speed, and the pause between sentences                           |
| `READ_PRONUNCIATIONS`                     | none                          | A file of `written=spoken` lines                                                |
| `READ_ASR_VOCAB`                          | none                          | Words speech recognition should expect                                          |
| `KIT_CONNECT`                             | none                          | Other Apps' MCP endpoints to pair with                                          |

Without a model, reading commands still work and questions get a one-line answer saying no model is set up.

## Develop

```
npm install
npm run typecheck
npm run lint
npm test
npm run expect
npm run build
```

Proofs are unit tests beside the code and expect tests in `expect/`: an input file per case with a human-approved `name.expect.md` beside it. The test files in `fixtures/files` are made up.

## Credits

The reader, its reading commands and the read-along come from Talk's file reader. The voice loop in `src/voice` is Talk's pi-voice.

## License

[MIT](LICENSE)
