#!/bin/bash
# Watson 自动化测试脚本
# 使用 agent-control 验证所有功能

set -e

PORT=9229
PLATFORM="electron"

echo "=== Watson 自动化测试 ==="
echo ""

# Test 1: 基础对话
echo "Test 1: 基础对话 + streaming"
agent-control -p $PLATFORM fill @e5 "用一句话介绍你自己"
agent-control -p $PLATFORM click @e6
sleep 8
RESULT=$(agent-control -p $PLATFORM eval "JSON.stringify(Array.from(document.querySelectorAll('.message-card')).slice(-2).map(m=>({role:m.classList.contains('user')?'user':'assistant',status:m.querySelector('.status-bar')?.innerText?.trim()||''})))")
echo "结果: $RESULT"
if echo "$RESULT" | grep -q '"status":"✓"'; then
  echo "✅ 基础对话通过"
else
  echo "❌ 基础对话失败"
  exit 1
fi
echo ""

# Test 2: 工具调用
echo "Test 2: 工具调用"
agent-control -p $PLATFORM fill @e5 "创建一个文件 /tmp/watson-test.txt，内容是 'Hello Watson'"
agent-control -p $PLATFORM click @e6
sleep 10
RESULT=$(agent-control -p $PLATFORM eval "document.querySelector('.messages').innerText")
if echo "$RESULT" | grep -q "tools completed\|tool"; then
  echo "✅ 工具调用 UI 显示正常"
else
  echo "⚠️  未检测到工具调用 UI"
fi
if [ -f /tmp/watson-test.txt ]; then
  echo "✅ 工具执行成功（文件已创建）"
  rm /tmp/watson-test.txt
else
  echo "❌ 工具执行失败（文件未创建）"
fi
echo ""

# Test 3: Session 管理
echo "Test 3: Session 管理"
agent-control -p $PLATFORM click @e1  # 新建 session
sleep 1
agent-control -p $PLATFORM fill @e5 "这是新 session"
agent-control -p $PLATFORM click @e6
sleep 5
SESSION_COUNT=$(sqlite3 ~/.watson/messages.db "SELECT COUNT(DISTINCT session_id) FROM messages")
echo "Session 数量: $SESSION_COUNT"
if [ "$SESSION_COUNT" -gt 1 ]; then
  echo "✅ Session 管理正常"
else
  echo "❌ Session 管理失败"
fi
echo ""

# Test 4: 设置面板
echo "Test 4: 设置面板"
agent-control -p $PLATFORM click @e2  # 打开设置
sleep 1
SETTINGS=$(agent-control -p $PLATFORM -e snapshot | grep -E "select-one|password|text")
if echo "$SETTINGS" | grep -q "LightDark\|AnthropicOpenAI"; then
  echo "✅ 设置面板正常"
else
  echo "❌ 设置面板异常"
fi
agent-control -p $PLATFORM click @e3  # 关闭设置（假设 @e3 是关闭按钮）
echo ""

# Test 5: 截图功能
echo "Test 5: 截图功能"
agent-control -p $PLATFORM click @e4  # 截图按钮
sleep 2
TEXTAREA=$(agent-control -p $PLATFORM eval "document.querySelector('textarea').value")
if echo "$TEXTAREA" | grep -q "\[Screen:"; then
  echo "✅ 截图功能正常"
else
  echo "❌ 截图功能异常"
fi
echo ""

# Test 6: 持久化
echo "Test 6: 持久化验证"
MSG_COUNT=$(sqlite3 ~/.watson/messages.db "SELECT COUNT(*) FROM messages")
echo "数据库消息数: $MSG_COUNT"
if [ "$MSG_COUNT" -gt 0 ]; then
  echo "✅ 持久化正常"
else
  echo "❌ 持久化失败"
fi
echo ""

echo "=== 测试完成 ==="
