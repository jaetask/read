# Lantern Agent: sample review

Jan 1, 2026 · @Tester

A made-up agent, written only for Talk's tests. Nothing here describes real software.

## What it is

Lantern is a pretend assistant that answers questions and runs small jobs from a chat window.

## Stack and size

The core is written in Python. The repository is small: about two hundred files and a few thousand lines.

## 1. The agent loop

Lantern asks the model, runs any tools it requests, and repeats until the model answers without a tool or a step limit is reached.

## 2. Tools

It has a handful of built-in tools: reading files, searching notes and setting reminders.

## 3. Where commands run

Commands run inside a sandbox. An egress proxy sends the sandbox's network traffic through a credential firewall on the host, so secrets never enter the sandbox.

## 4. Multi-agent work

One agent can hand a task to a helper agent, which works on its own and returns a short summary.

## 5. Sessions and memory

Each conversation is a session. Lantern keeps a short list of facts about the user between sessions.

## Assessment

Lantern is simple and easy to follow, which makes it a good fixture.
