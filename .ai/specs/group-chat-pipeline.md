# Watson Group Chat — Stateless Delegate Pipeline

## 核心原则

**每一步都是独立的短 LLM call，每步产生独立的 ChatMessage。**

## 三步 Pipeline

```
User message → [user msg record]
    │
    ▼
Step 1: Orchestrator Route (invisible — no message produced)
    │
    ├─ delegate_to(id, instruction) ──→ Step 2
    ├─ self_reply ──→ Orchestrator responds [assistant msg record]
    └─ stay_silent ──→ done
    
Step 2: Delegate Reply [assistant msg record, senderId=delegate]
    │
    ▼
Step 3: Orchestrator Close
    ├─ text response [assistant msg record, senderId=orchestrator]
    ├─ delegate_to(another) ──→ back to Step 2 (max 3 rounds)
    └─ stay_silent ──→ done
```

## 消息独立性

每步产生独立的 ChatMessage record：
- 有自己的 id、timestamp、senderId、senderName
- 独立存储到 DB（workspace-db messages table）
- UI 按时间顺序渲染，就像真正的 IM 群聊

## 文件清单

| 文件 | 层 | 职责 |
|------|-----|------|
| `domain/group-chat.ts` | Domain | GroupChat pipeline + ORCHESTRATOR_TOOLS + CLOSE_TOOLS |
| `infrastructure/claw-bridge.ts` | Infra | `createGroupLLMStream()` — 每步独立 claw 实例 |
| `application/workspace-manager.ts` | App | `sendGroupMessage()` — 串联 pipeline + session |
| `application/chat-handlers.ts` | App | IPC 路由，auto-detect group mode |
| `composables/useChatSession.ts` | Renderer | 支持 mode 参数 |

## Auto-detect

当 workspace 配置了 >1 个 agent 时，自动进入 group mode。
单 agent 时保持原有 chat mode，零影响。
