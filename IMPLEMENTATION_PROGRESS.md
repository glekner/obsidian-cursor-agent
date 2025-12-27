# Cursor Agent Chat Plugin - Implementation Progress

## Overview

An Obsidian plugin that bridges Cursor CLI agent with your vault, providing a chat interface for AI-assisted note management with streaming responses.

---

## Using Context7 MCP for Documentation

**Critical**: Always use Context7 MCP to fetch up-to-date documentation before implementing features. APIs and CLIs evolve frequently—stale assumptions lead to bugs.

### Key Libraries to Query

| Library      | Context7 ID                | When to Use                                        |
| ------------ | -------------------------- | -------------------------------------------------- |
| Cursor CLI   | `/websites/cursor_cli`     | NDJSON format, CLI flags, auth, session management |
| Obsidian API | `/obsidianmd/obsidian-api` | Views, modals, settings, workspace events          |
| Obsidian Git | `/vinzent03/obsidian-git`  | Git integration patterns (optional)                |

### Example Queries

```
# Before implementing streaming parser:
mcp_Context7_get-library-docs(context7CompatibleLibraryID="/websites/cursor_cli", topic="output format ndjson streaming")

# Before creating ItemView:
mcp_Context7_get-library-docs(context7CompatibleLibraryID="/obsidianmd/obsidian-api", topic="ItemView sidebar register")

# Before implementing settings:
mcp_Context7_get-library-docs(context7CompatibleLibraryID="/obsidianmd/obsidian-api", topic="PluginSettingTab settings")
```

**Why this matters**:

-   Cursor CLI is new and actively developed—flags may change
-   Obsidian API has undocumented patterns best learned from examples
-   Prevents wasted time on deprecated approaches

---

## Implementation Checklist

### Phase 1: Foundation

-   [x] **Types & Interfaces** (`src/types.ts`)

    -   [x] NDJSON event types (system, user, assistant, tool_call, result)
    -   [x] Settings interface
    -   [x] Session/conversation types

-   [x] **Auth Helper** (`src/cursor/auth.ts`)

    -   [x] Detect if cursor-agent is logged in
    -   [x] Fallback to API key from settings
    -   [x] Build auth args for spawn

-   [x] **Cursor Bridge** (`src/cursor/bridge.ts`)
    -   [x] Spawn cursor-agent with correct flags
    -   [x] Parse NDJSON stream line-by-line
    -   [x] Emit typed events to subscribers
    -   [x] Handle process errors and cleanup
    -   [x] Implement cancellation

### Phase 2: Session Management

-   [x] **Session Manager** (`src/cursor/session.ts`)
    -   [x] Store session_id from init events
    -   [x] List conversations (`cursor-agent ls`)
    -   [x] Resume conversation (`cursor-agent resume`)
    -   [x] Local message history tracking
    -   [x] Export/import for persistence

### Phase 3: UI Components

-   [x] **Chat View** (`src/ui/chat-view.ts`)

    -   [x] Register ItemView type
    -   [x] Basic container structure
    -   [x] Message list rendering
    -   [x] Streaming text updates (message-level)
    -   [x] Auto-scroll behavior
    -   [x] Active note context badge (like Copilot)

-   [x] **Chat Header** (in `src/ui/chat-view.ts`)

    -   [x] Model picker dropdown (in input footer, like Copilot)
    -   [x] New conversation button
    -   [x] Chat history button/menu

-   [x] **Message Renderer** (in `src/ui/chat-view.ts`)

    -   [x] User message styling
    -   [x] Assistant message with markdown
    -   [x] Tool call indicators (collapsible)
    -   [x] Timestamps on messages

-   [x] **Input Area** (`src/ui/input-area.ts`)
    -   [x] Textarea with auto-resize
    -   [x] Send button
    -   [x] Keyboard shortcut (Cmd/Ctrl+Enter)
    -   [x] Disable during streaming

### Phase 4: Settings

-   [x] **Settings Tab** (`src/settings.ts`)
    -   [x] API key (secret input)
    -   [x] Show tool calls toggle
    -   [x] Permission mode dropdown
    -   [x] Custom instructions textarea
    -   [x] Working directory path

### Phase 5: Plugin Integration

-   [x] **Main Plugin** (`src/main.ts`)

    -   [x] Register chat view
    -   [x] Add ribbon icon
    -   [x] Register commands
    -   [x] Load/save settings
    -   [x] Cleanup on unload

-   [ ] **Commands**
    -   [x] Open Cursor chat
    -   [x] Send selection to Cursor
    -   [x] Resume last conversation
    -   [x] New conversation

### Phase 6: Polish

-   [x] **Styles** (`styles.css`)

    -   [x] Chat container layout
    -   [x] Message bubbles
    -   [x] Tool call styling (collapsible)
    -   [x] Model picker dropdown
    -   [x] Chat history menu
    -   [x] Timestamps and message meta
    -   [x] Dark/light theme support

-   [x] **Manifest** (`manifest.json`)

    -   [x] Update plugin ID and name
    -   [x] Set `isDesktopOnly: true`
    -   [x] Update description

-   [ ] **Git Detection** (optional)
    -   [ ] Check if vault is git repo
    -   [ ] Show info notice about enhanced context

---

## Testing Checklist

-   [ ] cursor-agent installed and in PATH
-   [ ] Authentication works (login or API key)
-   [ ] Basic message send/receive
-   [ ] Streaming renders incrementally
-   [ ] Tool calls display correctly
-   [ ] Model switching works
-   [ ] Session resume works
-   [ ] Settings persist across reload
-   [ ] Plugin unloads cleanly (no leaks)
-   [ ] Works with vault as git repo
-   [ ] Works without git

---

## Coding Conventions

- All `console.log` statements must start with `[cursor-agent]` prefix for easy filtering

## Known Issues / Notes

_Track issues discovered during implementation:_

1. ...

---

## Resources

-   [Cursor CLI Docs](https://cursor.com/docs/cli/overview)
-   [Obsidian Plugin API](https://docs.obsidian.md)
-   [Obsidian Sample Plugin](https://github.com/obsidianmd/obsidian-sample-plugin)
-   [Plan File](.cursor/plans/cursor_agent_chat_plugin_ad59ca67.plan.md)

---

## Reference Implementation: Obsidian Copilot

**Local clone**: `~/coding/misc/obsidian-copilot`

Use this as inspiration for the chat UI. Key files to study:

| Component   | Path                       | What to Learn                   |
| ----------- | -------------------------- | ------------------------------- |
| Chat View   | `src/components/Chat*.tsx` | Message layout, streaming UI    |
| Settings    | `src/settings/`            | Settings tab patterns           |
| Main Plugin | `src/main.ts`              | View registration, commands     |
| Styles      | `styles.css`               | Chat styling, dark/light themes |

**Copy/adapt patterns for:**

-   Chat bubble styling
-   Input area with send button
-   Streaming text animation
-   Model picker dropdown
-   Tool call collapsible sections

> Note: Obsidian Copilot talks to LLM APIs directly. Our plugin spawns `cursor-agent` CLI instead, but the UI patterns are directly reusable.
