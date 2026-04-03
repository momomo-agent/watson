#!/bin/bash
# Migration script to add agent_id column to messages table

DB_PATH="$HOME/.watson/messages.db"

if [ ! -f "$DB_PATH" ]; then
  echo "Database not found at $DB_PATH"
  exit 0
fi

echo "Adding agent_id column to messages table..."

sqlite3 "$DB_PATH" <<EOF
-- Check if column exists
.mode column
PRAGMA table_info(messages);

-- Add agent_id column if it doesn't exist
ALTER TABLE messages ADD COLUMN agent_id TEXT;

-- Verify
PRAGMA table_info(messages);
EOF

echo "Migration complete!"
