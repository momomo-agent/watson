#!/bin/bash
# Migrate Watson database to new schema

DB=~/.watson/messages.db

echo "🔧 Migrating Watson database schema..."

# Backup first
cp "$DB" "$DB.backup.$(date +%s)"
echo "✅ Backup created"

# Add missing columns
sqlite3 "$DB" "ALTER TABLE messages ADD COLUMN session_id TEXT" 2>/dev/null || echo "session_id already exists"
sqlite3 "$DB" "ALTER TABLE messages ADD COLUMN tool_calls TEXT" 2>/dev/null || echo "tool_calls already exists"
sqlite3 "$DB" "ALTER TABLE messages ADD COLUMN error TEXT" 2>/dev/null || echo "error already exists"
sqlite3 "$DB" "ALTER TABLE messages ADD COLUMN error_category TEXT" 2>/dev/null || echo "error_category already exists"

echo "✅ Migration complete"
echo ""
sqlite3 "$DB" ".schema messages"
