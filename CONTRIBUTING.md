# Contributing

## Commit Conventions

This project follows [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation changes
- `chore` - Maintenance tasks, dependency updates
- `refactor` - Code refactoring without changing functionality
- `test` - Adding or updating tests
- `style` - Code style changes (formatting, etc.)

### Examples

```
feat(extension): add password generator component
fix(crypto): resolve key derivation issue on Firefox
docs: update README with setup instructions
chore(deps): update vite to v5.0
```

## AI Assistance Disclosure

When AI tools (such as Claude, GitHub Copilot, ChatGPT, etc.) are used to generate or significantly modify code, commits must include a `Co-Authored-By` footer to maintain transparency:

```
Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

### When to include AI co-authorship

- AI generated the majority of the code/content
- AI significantly restructured or rewrote existing code
- AI provided substantial implementation guidance that was directly used

### When it's not necessary

- Minor suggestions or autocomplete
- Syntax corrections or simple refactoring suggestions
- Using AI only for explanation or debugging without code generation

### AI assistance format

Use short, concrete action words separated by commas:

- `searched` - found files, patterns, or information
- `structured` - organized code or content layout
- `generated` - wrote new code or content
- `refactored` - restructured existing code
- `debugged` - identified and fixed issues
- `hints` - provided guidance or suggestions
- `reviewed` - checked code for issues
- `documented` - wrote documentation or comments

### Full commit example with AI disclosure

```
feat(crypto): implement AES-256 encryption adapter

Add Web Crypto API wrapper for encrypting password entries
using AES-256-GCM with PBKDF2 key derivation.

AI assistance: searched, structured, generated, hints

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```
