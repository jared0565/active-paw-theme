#!/bin/bash
# Setup script for Active Paw theme development environment
# Runs automatically on Claude Code session start

# Install graphify globally for persistent access across sessions
if ! command -v graphify &> /dev/null; then
    echo "Installing graphify..."
    uv tool install --upgrade graphifyy 2>&1 | tail -3
    echo "✓ graphify installed globally"
else
    echo "✓ graphify already installed"
fi

echo "Active Paw theme environment ready"
echo ""
echo "To enable Superpowers plugin (one-time setup in Claude Code):"
echo "  Run: /plugin install superpowers@claude-plugins-official"
echo ""
