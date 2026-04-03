# Watson Session Management Test Plan (MOMO-38)

## ✅ Schema Migration
- Database migrated successfully
- All required columns present: `session_id`, `tool_calls`, `error`, `error_category`

## 🧪 Manual Test Steps

### Test 1: Message Persistence ✅
**Goal:** Verify messages are saved to SQLite

**Steps:**
1. Open Watson
2. Send a message: "Hello, test message"
3. Check database:
   ```bash
   sqlite3 ~/.watson/messages.db "SELECT id, session_id, role, content, status FROM messages ORDER BY created_at DESC LIMIT 5"
   ```

**Expected:**
- Message appears in database
- `session_id` is populated
- `role` is 'user' or 'assistant'
- `status` is 'complete'

---

### Test 2: Session Switching ✅
**Goal:** Verify messages load correctly when switching sessions

**Steps:**
1. In Watson, create Session A, send message "Session A message"
2. Create Session B, send message "Session B message"
3. Switch back to Session A
4. Check that only "Session A message" is visible
5. Switch to Session B
6. Check that only "Session B message" is visible

**Expected:**
- Each session shows only its own messages
- Messages load instantly on switch (no delay)
- No cross-contamination between sessions

**Verify in DB:**
```bash
sqlite3 ~/.watson/messages.db "SELECT session_id, COUNT(*) FROM messages GROUP BY session_id"
```

---

### Test 3: Reactivity ✅
**Goal:** Verify UI updates in real-time

**Steps:**
1. Send a message that triggers streaming (e.g., "Write a short poem")
2. Watch the UI as the response streams in
3. Check that:
   - Message status changes: pending → streaming → complete
   - Text appears character by character
   - No UI freezes or delays

**Expected:**
- Smooth streaming animation
- Status indicator updates correctly
- Message persists after streaming completes

---

### Test 4: Tool Calls (Bonus)
**Goal:** Verify tool calls are persisted

**Steps:**
1. Send a message that triggers a tool (if tools are configured)
2. Check database:
   ```bash
   sqlite3 ~/.watson/messages.db "SELECT id, tool_calls FROM messages WHERE tool_calls IS NOT NULL"
   ```

**Expected:**
- `tool_calls` column contains JSON array
- Tool status is tracked correctly

---

## 🔍 Quick Verification Commands

```bash
# Count total messages
sqlite3 ~/.watson/messages.db "SELECT COUNT(*) FROM messages"

# List all sessions
sqlite3 ~/.watson/messages.db "SELECT DISTINCT session_id, COUNT(*) as msg_count FROM messages GROUP BY session_id"

# Show recent messages
sqlite3 ~/.watson/messages.db "SELECT session_id, role, substr(content,1,50) as content, status FROM messages ORDER BY created_at DESC LIMIT 10"

# Check for errors
sqlite3 ~/.watson/messages.db "SELECT id, error, error_category FROM messages WHERE error IS NOT NULL"
```

---

## ✅ Success Criteria

- [x] Schema migration complete
- [ ] Messages persist to SQLite
- [ ] Session switching loads correct messages
- [ ] UI updates reactively during streaming
- [ ] No cross-session message leakage

**Status:** Ready for manual testing. Database schema is correct.
