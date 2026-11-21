# Beacon Bot: numbered sample

Jan 3, 2026 · @Tester

A made-up bot, written only for Talk's tests. Nothing here describes real software.

## What it is

Beacon Bot is a pretend helper that sorts messages into folders.

## 1. The loop

Beacon reads a message, picks a folder, and repeats until the inbox is empty.

## 2. Tools

It has two tools: a folder picker and a label maker.

## 3. Safety

Beacon never deletes a message. It only moves messages between folders.

## 4. Memory

Beacon remembers which folder each sender usually goes to.

## 5. Models

Beacon can use any small model that can follow short instructions.

## 6. Interfaces

The main interface is a web page. There is also a menu bar icon and a Slack bot that posts a daily summary.

## 7. Tests

There are a few dozen tests that check folders are picked correctly.

## Assessment

Beacon is simple, which makes it a good fixture.
