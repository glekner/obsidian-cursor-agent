# Cursor Agent Chat Plugin - Implementation Progress

## Overview

An Obsidian plugin that bridges Cursor CLI agent with your vault, providing a chat interface for AI-assisted note management with streaming responses.

---

## Using Context7 MCP for Documentation

**Critical**: Always use Context7 MCP to fetch up-to-date documentation before implementing features. APIs and CLIs evolve frequently—stale assumptions lead to bugs.

### Key Libraries to Query

| Library | Context7 ID | When to Use |
|---------|-------------|-------------|
| Cursor CLI | `/websites/cursor_cli` | NDJSON format, CLI flags, auth, session management |
| Obsidian API | `/obsidianmd/obsidian-api` | Views, modals, settings, workspace events |
| Obsidian Git | `/vinzent03/obsidian-git` | Git integration patterns (optional) |

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
- Cursor CLI is new and actively developed—flags may change
- Obsidian API has undocumented patterns best learned from examples
- Prevents wasted time on deprecated approaches

---

## Implementation Checklist

### Phase 1: Foundation

- [ ] **Types & Interfaces** (`src/types.ts`)
  - [ ] NDJSON event types (system, user, assistant, tool_call, result)
  - [ ] Settings interface
  - [ ] Session/conversation types

- [ ] **Auth Helper** (`src/cursor/auth.ts`)
  - [ ] Detect if cursor-agent is logged in
  - [ ] Fallback to API key from settings
  - [ ] Build auth args for spawn

- [ ] **Cursor Bridge** (`src/cursor/bridge.ts`)
  - [ ] Spawn cursor-agent with correct flags
  - [ ] Parse NDJSON stream line-by-line
  - [ ] Emit typed events to subscribers
  - [ ] Handle process errors and cleanup
  - [ ] Implement cancellation

### Phase 2: Session Management

- [ ] **Session Manager** (`src/cursor/session.ts`)
  - [ ] Store session_id from init events
  - [ ] List conversations (`cursor-agent ls`)
  - [ ] Resume conversation (`cursor-agent resume`)

### Phase 3: UI Components

- [ ] **Chat View** (`src/ui/chat-view.ts`)
  - [ ] Register ItemView type
  - [ ] Basic container structure
  - [ ] Message list rendering
  - [ ] Streaming text updates
  - [ ] Auto-scroll behavior

- [ ] **Chat Header** (`src/ui/chat-header.ts`)
  - [ ] Model picker dropdown
  - [ ] New conversation button
  - [ ] Resume conversation button

- [ ] **Message Renderer** (`src/ui/message-renderer.ts`)
  - [ ] User message styling
  - [ ] Assistant message with markdown
  - [ ] Tool call indicators (collapsible)

- [ ] **Input Area** (`src/ui/input-area.ts`)
  - [ ] Textarea with auto-resize
  - [ ] Send button
  - [ ] Keyboard shortcut (Cmd/Ctrl+Enter)
  - [ ] Disable during streaming

### Phase 4: Settings

- [ ] **Settings Tab** (`src/settings.ts`)
  - [ ] API key (secret input)
  - [ ] Show tool calls toggle
  - [ ] Permission mode dropdown
  - [ ] Custom instructions textarea
  - [ ] Working directory path

### Phase 5: Plugin Integration

- [ ] **Main Plugin** (`src/main.ts`)
  - [ ] Register chat view
  - [ ] Add ribbon icon
  - [ ] Register commands
  - [ ] Load/save settings
  - [ ] Cleanup on unload

- [ ] **Commands**
  - [ ] Open Cursor chat
  - [ ] Send selection to Cursor
  - [ ] Resume last conversation
  - [ ] New conversation

### Phase 6: Polish

- [ ] **Styles** (`styles.css`)
  - [ ] Chat container layout
  - [ ] Message bubbles
  - [ ] Tool call styling
  - [ ] Model picker dropdown
  - [ ] Dark/light theme support

- [ ] **Manifest** (`manifest.json`)
  - [ ] Update plugin ID and name
  - [ ] Set `isDesktopOnly: true`
  - [ ] Update description

- [ ] **Git Detection** (optional)
  - [ ] Check if vault is git repo
  - [ ] Show info notice about enhanced context

---

## Testing Checklist

- [ ] cursor-agent installed and in PATH
- [ ] Authentication works (login or API key)
- [ ] Basic message send/receive
- [ ] Streaming renders incrementally
- [ ] Tool calls display correctly
- [ ] Model switching works
- [ ] Session resume works
- [ ] Settings persist across reload
- [ ] Plugin unloads cleanly (no leaks)
- [ ] Works with vault as git repo
- [ ] Works without git

---

## Known Issues / Notes

_Track issues discovered during implementation:_

1. ...

---

## Resources

- [Cursor CLI Docs](https://cursor.com/docs/cli/overview)
- [Obsidian Plugin API](https://docs.obsidian.md)
- [Obsidian Sample Plugin](https://github.com/obsidianmd/obsidian-sample-plugin)
- [Plan File](.cursor/plans/cursor_agent_chat_plugin_ad59ca67.plan.md)

---

## Reference Implementation: Obsidian Copilot

**Local clone**: `~/coding/misc/obsidian-copilot`

Use this as inspiration for the chat UI. Key files to study:

| Component | Path | What to Learn |
|-----------|------|---------------|
| Chat View | `src/components/Chat*.tsx` | Message layout, streaming UI |
| Settings | `src/settings/` | Settings tab patterns |
| Main Plugin | `src/main.ts` | View registration, commands |
| Styles | `styles.css` | Chat styling, dark/light themes |

**Copy/adapt patterns for:**
- Chat bubble styling
- Input area with send button
- Streaming text animation
- Model picker dropdown
- Tool call collapsible sections

> Note: Obsidian Copilot talks to LLM APIs directly. Our plugin spawns `cursor-agent` CLI instead, but the UI patterns are directly reusable.

