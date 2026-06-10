# Claude Code Plugins for Active Paw Theme

This project is enhanced with development plugins that improve code quality and project management.

## Required Plugins

### Superpowers (Development Methodology)
Superpowers guides the AI through a structured development process: spec → design review → implementation plan → subagent-driven development.

**Install (one-time, per session):**
```
/plugin install superpowers@claude-plugins-official
```

**Benefits:**
- Enforces spec-first development
- Auto-generates implementation plans
- Enables multi-agent parallel work
- Ensures TDD and YAGNI principles

**Reference:** https://github.com/obra/superpowers

---

## Persistent Plugin Setup

Plugins in Claude Code are installed per-session. To ensure Superpowers is available every time you work on this project:

1. **First time setup:** Run `/plugin install superpowers@claude-plugins-official` 
2. **Future sessions:** The plugin persists if Claude Code caches your session config

## Alternative: Manual Installation

If you prefer to install plugins manually each session:
```
/plugin install superpowers@claude-plugins-official
```

Then start any task with a clear description of what you're building, and Superpowers will guide the process.

---

## Plugin Marketplace

Other useful plugins available:
- `superpowers@superpowers-marketplace` — from custom marketplace
- Check `https://claude.com/plugins/` for the full list
