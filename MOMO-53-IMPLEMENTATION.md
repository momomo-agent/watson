# MOMO-53: Watson API Key Rotation Implementation

## 实现概述

为 Watson 实现了多密钥自动切换和 rate limit 处理，参考 Paw 的 api-keys.js 实现。

## 实现的功能

### 1. 多密钥配置支持

**Config 接口更新** (`src/main/infrastructure/config.ts`):
```typescript
export interface Config {
  provider: 'anthropic' | 'openai'
  apiKey?: string      // 单密钥（向后兼容）
  apiKeys?: string[]   // 多密钥数组（新增）
  baseUrl?: string
  model?: string
  mcpServers?: Record<string, McpServerConfig>
}
```

**配置格式**:
```json
{
  "provider": "anthropic",
  "apiKeys": [
    "sk-ant-key-1",
    "sk-ant-key-2",
    "sk-ant-key-3"
  ],
  "model": "claude-sonnet-4-20250514"
}
```

### 2. API Key Manager (`src/main/infrastructure/api-keys.ts`)

核心功能：
- **getCurrentKey()**: 获取当前密钥
- **rotate()**: 轮换到下一个密钥
- **recordUsage(success)**: 记录使用统计
- **getStats()**: 获取所有密钥的使用统计

特性：
- 支持单密钥和多密钥配置
- 自动循环轮换（key1 → key2 → key3 → key1）
- 统计每个密钥的使用次数和失败次数
- 线程安全（原子索引更新）

### 3. Rate Limit 检测与自动切换

**Enhanced LLM Client 集成** (`src/main/infrastructure/enhanced-llm-client.ts`):

在 `streamChatWithRetry` 中：
1. 检测到 429 rate-limit 错误
2. 立即轮换到下一个密钥（无延迟）
3. 用新密钥重试请求
4. 如果所有密钥都 rate-limit，才使用指数退避

**行为示例**:
```
Request 1 → 429 with key-1 → rotate to key-2 → retry immediately
Request 2 → 429 with key-2 → rotate to key-3 → retry immediately
Request 3 → 429 with key-3 → rotate to key-1 → retry immediately
Request 4 → 429 with key-1 (all exhausted) → exponential backoff
```

### 4. 失败重试策略

**多层重试机制**:
1. **Key rotation**: 429 错误时立即切换密钥（0ms 延迟）
2. **Exponential backoff**: 其他可重试错误（500, 502, 503, 529）
3. **Provider failover**: 主 provider 失败后切换到备用 provider

**重试次数**: 默认 3 次（可配置）

## 测试结果

运行 `test-api-key-rotation.ts`:
```
✓ Single key test passed
✓ Multiple key rotation test passed
✓ Stats tracking test passed
✓ All tests passed!
```

测试覆盖：
- 单密钥配置（无轮换）
- 多密钥轮换（循环）
- 使用统计追踪
- 配置格式验证

## 向后兼容性

- 单密钥配置（`apiKey`）继续工作
- 自动规范化：`apiKey` → `apiKeys: [apiKey]`
- 现有代码无需修改

## 使用方式

### 配置文件

在 `.watson/config.json` 中：
```json
{
  "provider": "anthropic",
  "apiKeys": [
    "sk-ant-api03-xxx",
    "sk-ant-api03-yyy",
    "sk-ant-api03-zzz"
  ],
  "model": "claude-sonnet-4-20250514"
}
```

### 代码中使用

EnhancedLLMClient 自动处理：
```typescript
// 自动使用 config.apiKeys 进行轮换
yield* EnhancedLLMClient.streamChatWithRetry(options, maxRetries, {
  onRetry: (event) => {
    console.log(`Retry: ${event.reason}`)
  }
})
```

## 实现文件

1. `src/main/infrastructure/api-keys.ts` - 密钥管理器（新增）
2. `src/main/infrastructure/config.ts` - 配置加载（修改）
3. `src/main/infrastructure/enhanced-llm-client.ts` - LLM 客户端（修改）
4. `test-api-key-rotation.ts` - 测试文件（新增）

## 与 Paw 的差异

| 特性 | Paw | Watson |
|------|-----|--------|
| 语言 | JavaScript | TypeScript |
| 状态管理 | 全局 state 对象 | ApiKeyManager 类 |
| 统计追踪 | Map<number, stats> | Map<number, KeyStats> |
| 集成点 | fetchWithRetry | EnhancedLLMClient |
| 类型安全 | 无 | 完整类型定义 |

## 后续优化建议

1. **持久化统计**: 将密钥使用统计保存到磁盘
2. **智能选择**: 优先使用失败率低的密钥
3. **健康检查**: 定期检测密钥是否有效
4. **UI 展示**: 在界面显示密钥使用情况

## 参考

- Paw 实现: `/Users/kenefe/LOCAL/momo-agent/projects/paw/core/api-keys.js`
- Paw 重试: `/Users/kenefe/LOCAL/momo-agent/projects/paw/core/api-retry.js`
