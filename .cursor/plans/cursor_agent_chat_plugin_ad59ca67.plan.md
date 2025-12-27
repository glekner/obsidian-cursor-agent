---
name: Cursor Agent Chat Plugin
overview: Build an Obsidian plugin that provides a chat interface bridging Cursor CLI agent with your vault, enabling AI-assisted note management with streaming responses and optional Git integration for enhanced context awareness.
todos:
  - id: setup-types
    content: Create TypeScript interfaces for NDJSON event types in types.ts
    status: pending
  - id: cursor-bridge
    content: Implement CursorBridge class to spawn cursor-agent and parse stream
    status: pending
    dependencies:
      - setup-types
      - auth-helper
  - id: session-manager
    content: Implement session management for resume/list conversations
    status: pending
    dependencies:
      - cursor-bridge
  - id: chat-view
    content: Create ItemView for chat sidebar with message rendering
    status: pending
    dependencies:
      - cursor-bridge
  - id: input-area
    content: Build chat input area with send functionality
    status: pending
    dependencies:
      - chat-view
  - id: chat-header
    content: Build chat header with model picker dropdown and action buttons
    status: pending
    dependencies:
      - chat-view
  - id: auth-helper
    content: Create auth helper to detect CLI login vs fallback to API key
    status: pending
  - id: settings-tab
    content: Implement settings tab with API key, permissions, custom instructions
    status: pending
  - id: register-commands
    content: Register plugin commands (open chat, send selection, resume)
    status: pending
    dependencies:
      - chat-view
      - session-manager
  - id: manifest-update
    content: "Update manifest.json with proper metadata and isDesktopOnly: true"
    status: pending
  - id: styles
    content: Add styles.css for chat UI styling
    status: pending
    dependencies:
      - chat-view
  - id: git-detection
    content: Add optional Git repo detection for enhanced context warning
    status: pending
---

# Cursor Agent Chat Plugin Implementation Plan

## Architecture Overview

```mermaid
flowchart TB
    subgraph obsidian [Obsidian Plugin]
        ChatView[Chat View UI]
        CursorBridge[Cursor Bridge]
        Settings[Settings Manager]
    end

    subgraph process [External Process]
        CursorCLI[cursor-agent CLI]
    end

    subgraph vault [Vault Filesystem]
        Notes[Markdown Notes]
        GitRepo[.git - optional]
    end

    ChatView -->|user message| CursorBridge
    CursorBridge -->|spawn with stream-json| CursorCLI
    CursorCLI -->|NDJSON events| CursorBridge
    CursorBridge -->|parsed events| ChatView
    CursorCLI -->|read/write files| Notes
    CursorCLI -->|git context| GitRepo
```

## Data Flow

```mermaid
sequenceDiagram
    participant User
    participant ChatView
    participant CursorBridge
    participant CLI as cursor-agent

    User->>ChatView: Types message
    ChatView->>CursorBridge: sendMessage(prompt)
    CursorBridge->>CLI: spawn with --output-format stream-json
    
    loop NDJSON Stream
        CLI-->>CursorBridge: system init event
        CLI-->>CursorBridge: assistant message delta
        CursorBridge-->>ChatView: updateUI(parsed event)
        CLI-->>CursorBridge: tool_call started/completed
        CursorBridge-->>ChatView: showToolActivity()
    end
    
    CLI-->>CursorBridge: result event
    CursorBridge-->>ChatView: conversationComplete()
```

## File Structure

```javascript
src/
  main.ts              # Plugin lifecycle only
  settings.ts          # Settings interface + tab
  types.ts             # TypeScript interfaces for NDJSON events
  cursor/
    bridge.ts          # Spawns cursor-agent, parses NDJSON stream
    session.ts         # Session management (resume, list)
    auth.ts            # Authentication helper (detect login vs API key)
  ui/
    chat-view.ts       # ItemView for sidebar chat panel
    chat-header.ts     # Model picker dropdown + action buttons
    message-renderer.ts # Renders messages, tool calls, markdown
    input-area.ts      # Chat input with send button
  utils/
    path-utils.ts      # Vault/system path conversion
```

## Key Implementation Details

### 1. Cursor Bridge ([src/cursor/bridge.ts](src/cursor/bridge.ts))

Uses Node.js `child_process.spawn` to run:

```bash
cursor-agent -p "user prompt" --output-format stream-json --cwd <vault-path>
```

Parses NDJSON stream line-by-line and emits typed events:

- `system` (init) - session_id, model info
- `assistant` - text content for rendering
- `tool_call` (started/completed) - file reads/writes, show activity
- `result` - final completion

### 2. Chat View ([src/ui/chat-view.ts](src/ui/chat-view.ts))

Registers as `ItemView` in right sidebar:

- Message history display with markdown rendering
- Streaming text updates as NDJSON arrives
- Tool call indicators (reading file X, writing file Y)
- Input area with send button + keyboard shortcut

### 3. Settings Design

**Settings Tab** ([src/settings.ts](src/settings.ts)):

| Setting | Type | Default | Description |

|---------|------|---------|-------------|

| `apiKey` | string (secret) | "" | Manual API key (only used if not logged in via CLI) |

| `showToolCalls` | toggle | true | Show file read/write activity in chat |

| `permissionMode` | dropdown | "default" | "default" (confirm) or "yolo" (auto-approve) |

| `customInstructions` | textarea | "" | Custom system prompt added to all conversations |

| `workingDirectory` | string | "" | Override cwd (empty = vault root) |

**Chat UI Header** (in [src/ui/chat-view.ts](src/ui/chat-view.ts)):

| Element | Description |

|---------|-------------|

| Model dropdown | Quick model switching (Claude 4 Sonnet, GPT-5, etc.) |

| New chat button | Start fresh conversation |

| Resume button | Resume last conversation |

**Authentication Flow**:

1. Check if `cursor-agent` is logged in (via existing credentials)
2. If not, use `apiKey` from settings with `--api-key` flag
3. Show warning notice if neither available

### 4. Session Management ([src/cursor/session.ts](src/cursor/session.ts))

- Store `session_id` from init events
- Commands: "Resume last conversation", "List conversations"
- Uses `cursor-agent resume` and `cursor-agent ls`

## Git Integration (Recommended, Not Required)

**Why Git helps:**

- Cursor agent uses Git for semantic search and context
- Agent can understand project structure, recent changes
- Better responses when modifying interconnected notes

**Without Git:**

- Plugin still works - agent can read/write files
- Less context-aware but functional

**With obsidian-git:**

- Optional auto-commit after agent changes
- Detect if vault is Git repo via `git rev-parse --git-dir`

## Desktop-Only Constraint

[manifest.json](manifest.json) must set `"isDesktopOnly": true` because:

- `child_process.spawn` requires Node.js/Electron
- Mobile Obsidian cannot run CLI processes

## Dependencies

- No new npm dependencies needed (uses Node.js built-ins via Electron)
- External: `cursor-agent` CLI must be installed (`curl https://cursor.com/install -fsS | bash`)

## Commands to Register

| Command ID | Name | Action ||------------|------|--------|| `open-chat` | Open Cursor chat | Opens chat view in sidebar || `send-selection` | Send selection to Cursor | Sends selected text as prompt || `resume-conversation` | Resume last conversation | `cursor-agent resume` || `new-conversation` | New conversation | Clears session, starts fresh |

## Risk Considerations

1. **CLI availability**: Settings should validate cursor-agent is installed
2. **Long-running processes**: Implement cancellation and timeout handling