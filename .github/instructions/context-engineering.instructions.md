---
description: 'Context engineering — help Copilot understand your codebase better'
applyTo: '**'
---

# Context Engineering

Principles for helping GitHub Copilot provide better suggestions.

## Project Structure

- **Descriptive file paths**: `src/auth/middleware.ts` > `src/utils/m.ts`
- **Colocate related code**: Keep components, tests, types together
- **Export public APIs from index files**: What's exported is the contract

## Code Patterns

- **Explicit types over inference**: Type annotations are context for Copilot
- **Semantic names**: `activeAdultUsers` > `x` — self-documenting is AI-readable
- **Named constants**: `MAX_RETRY_ATTEMPTS = 3` > magic number `3`

## Working with Copilot

- **Keep relevant files open in tabs**: Copilot uses open tabs as context
- **Position cursor intentionally**: Copilot prioritizes code near your cursor
- **Use Chat for complex tasks**: Inline completions have minimal context

## Context Hints

- **copilot-instructions.md**: Document architecture, patterns, conventions
- **Strategic comments**: At top of complex modules, describe flow/purpose
- **Reference patterns explicitly**: "Follow the same pattern as `src/api/users.ts`"

## Multi-File Changes

- **Describe scope first**: Tell Copilot all files involved before changes
- **Work incrementally**: One file at a time, verifying each change
- **Check understanding**: Ask "What files would you need to see?"

## When Copilot Struggles

- **Missing context**: Open relevant files in tabs, paste code snippets
- **Stale suggestions**: Re-open files or restart the session
- **Generic answers**: Be specific — add constraints, mention frameworks, reference existing code
