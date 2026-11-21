# reader

## Input

[reader.json](reader.json)

## Output

### Domain

| domain | version | about |
| --- | --- | --- |
| reader | 0.1.0 | A library of files read aloud: folders and files (Markdown, plain text and PDF), each split into sections, and one reader that reads the open file aloud sentence by sentence and keeps each file's place. |

### Actions

| action | effect | description |
| --- | --- | --- |
| reader.file-list | read | The folders and files in the library, folders first, each file with its title. |
| reader.file-get | read | One file split into sections by its headings (a PDF by its pages), with the section the reading last reached. |
| reader.file-find | read | Look something up in a file without moving the reading: the sections that say most about it, with their text. Leave path out for the open file. |
| reader.folder-create | write | Make a folder in the library, such as research or research/agents, to group files in. |
| reader.entry-move | write | Move or rename a file or folder in the library: from is its path, to is the new path, such as research/orca.md. A file keeps its place and its conversation. |
| reader.folder-remove | write | Remove an empty folder from the library. |
| reader.reader-state | read | The open file: its section titles with level and parent heading, the section the reading is at, and whether it is reading aloud. |
| reader.reader-open | write | Open a file in the reader, by its path or a distinctive part of its title. Set play to read it aloud from the top. |
| reader.reader-goto | write | Move the reader to a section of the open file and read it aloud from there. Section is its number as written in a numbered heading, or its title; index is its place in reader-state's list. Set play false to move without reading. |
| reader.reader-next | write | Read the section after the one last heard. Use it for 'next section'. |
| reader.reader-previous | write | Read the section before the one last heard. |
| reader.reader-pause | write | Pause reading aloud. The reader keeps its place. |
| reader.reader-resume | write | Carry on reading aloud from the sentence where it paused. |
| reader.reader-close | write | Close the open file. Its place is kept for next time. |
| reader.chat-turns | read | The conversation about a file: what was said and the reply, oldest first. Leave file out for the open file. |
| reader.chat-timeline | read | The trajectory of the conversation about a file: for each turn what was said, how it was routed, every reader call with its arguments and result, the reply, and the timings. Leave file out for the open file. |

### Agent context

```text
reader: A library of files read aloud: folders and files (Markdown, plain text and PDF), each split into sections, and one reader that reads the open file aloud sentence by sentence and keeps each file's place.
Tools:
- reader__file-list (reads): The folders and files in the library, folders first, each file with its title.
- reader__file-get (reads): One file split into sections by its headings (a PDF by its pages), with the section the reading last reached.
- reader__file-find (reads): Look something up in a file without moving the reading: the sections that say most about it, with their text. Leave path out for the open file.
- reader__folder-create (changes): Make a folder in the library, such as research or research/agents, to group files in.
- reader__entry-move (changes): Move or rename a file or folder in the library: from is its path, to is the new path, such as research/orca.md. A file keeps its place and its conversation.
- reader__folder-remove (changes): Remove an empty folder from the library.
- reader__reader-state (reads): The open file: its section titles with level and parent heading, the section the reading is at, and whether it is reading aloud.
- reader__reader-open (changes): Open a file in the reader, by its path or a distinctive part of its title. Set play to read it aloud from the top.
- reader__reader-goto (changes): Move the reader to a section of the open file and read it aloud from there. Section is its number as written in a numbered heading, or its title; index is its place in reader-state's list. Set play false to move without reading.
- reader__reader-next (changes): Read the section after the one last heard. Use it for 'next section'.
- reader__reader-previous (changes): Read the section before the one last heard.
- reader__reader-pause (changes): Pause reading aloud. The reader keeps its place.
- reader__reader-resume (changes): Carry on reading aloud from the sentence where it paused.
- reader__reader-close (changes): Close the open file. Its place is kept for next time.
- reader__chat-turns (reads): The conversation about a file: what was said and the reply, oldest first. Leave file out for the open file.
- reader__chat-timeline (reads): The trajectory of the conversation about a file: for each turn what was said, how it was routed, every reader call with its arguments and result, the reply, and the timings. Leave file out for the open file.
A tool that changes something after the person says yes waits for them; tell them what you asked for.
```

### Inputs

#### reader.file-list

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {}
}
```

#### reader.file-get

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "path": {
      "type": "string",
      "minLength": 1
    }
  },
  "required": [
    "path"
  ]
}
```

#### reader.file-find

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "about": {
      "type": "string",
      "minLength": 1
    },
    "path": {
      "type": "string"
    }
  },
  "required": [
    "about"
  ]
}
```

#### reader.folder-create

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "path": {
      "type": "string",
      "minLength": 1
    }
  },
  "required": [
    "path"
  ]
}
```

#### reader.entry-move

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "from": {
      "type": "string",
      "minLength": 1
    },
    "to": {
      "type": "string",
      "minLength": 1
    }
  },
  "required": [
    "from",
    "to"
  ]
}
```

#### reader.folder-remove

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "path": {
      "type": "string",
      "minLength": 1
    }
  },
  "required": [
    "path"
  ]
}
```

#### reader.reader-state

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {}
}
```

#### reader.reader-open

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "file": {
      "type": "string",
      "minLength": 1
    },
    "play": {
      "type": "boolean"
    }
  },
  "required": [
    "file"
  ]
}
```

#### reader.reader-goto

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "section": {
      "type": "string",
      "minLength": 1
    },
    "index": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "play": {
      "type": "boolean"
    }
  }
}
```

#### reader.reader-next

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {}
}
```

#### reader.reader-previous

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {}
}
```

#### reader.reader-pause

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {}
}
```

#### reader.reader-resume

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {}
}
```

#### reader.reader-close

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {}
}
```

#### reader.chat-turns

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "file": {
      "type": "string"
    }
  }
}
```

#### reader.chat-timeline

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "file": {
      "type": "string"
    }
  }
}
```
