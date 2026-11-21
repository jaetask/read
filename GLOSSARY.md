# Glossary

The words Read uses. Code, tests, docs and conversation use these words and no synonyms.
Read is built on [open-agent-kit](https://github.com/jaetask/open-agent-kit); the Kit's words (App, Domain, Action, Effect, Call, Outcome, Contract, Connection) keep the meaning its glossary gives them.

## Language

**Library**: The folder of files Read reads from, with its folders. Set by `READ_FILES_DIR`.
_Avoid_: collection, drive, documents

**File**: One Markdown, plain text or PDF file in the library, named by its path inside it.
_Avoid_: article, document, doc

**Section**: One part of a file: a Markdown heading (H1 to H4) and the text under it, or one page of a PDF.
_Avoid_: chapter, part, chunk

**Reader**: What reads the open file aloud, sentence by sentence, and keeps each file's place.
_Avoid_: player, narrator

**Place**: The section the reader last reached in a file, kept for when it is opened again.
_Avoid_: bookmark, progress, position

**Read-along**: The sentence being heard, highlighted on the page as it is spoken.
_Avoid_: karaoke, captions

**Reading command**: Something said or typed that moves the reader, such as "next", "pause" or "reread the tools section". Resolved by Read itself, without a model.
_Avoid_: intent, voice command

**Agent**: The model that answers questions about the open file, and can move the reader with the reader's Actions.
_Avoid_: assistant, bot, companion

**Turn**: One thing said or typed, and the reply.
_Avoid_: message, exchange
