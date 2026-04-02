# Phase 3: 屏幕感知集成

## 目标

让 Watson 能够感知用户当前正在看的内容，实现真正的上下文感知对话。

## 功能需求

### 1. screen_sense 工具

**输入：**
```json
{
  "target": "frontmost" | "all" | number  // 可选，默认 frontmost
}
```

**输出：**
```json
{
  "app": "Safari",
  "title": "OpenAI GPT-4 - Wikipedia",
  "content": "...",  // 可访问的文本内容
  "url": "https://..."  // 如果是浏览器
}
```

**实现：**
- 调用 `agent-control -p macos snapshot`
- 解析 JSON 输出
- 提取关键信息

### 2. 自动触发时机

**不自动触发**，只在以下情况调用：
- LLM 主动调用工具
- 用户明确要求（"看看我在看什么"）

### 3. UI 显示

工具调用显示为：
```
🖥️ 查看屏幕内容
```

## 技术方案

### 工具定义

在 LLM 的 tools 数组中添加：

```typescript
{
  name: "screen_sense",
  description: "Get content from the user's current screen. Use when user asks about what they're looking at, or when context from their screen would help answer their question.",
  input_schema: {
    type: "object",
    properties: {
      target: {
        type: "string",
        enum: ["frontmost", "all"],
        description: "Which window to capture. 'frontmost' for active window, 'all' for all visible windows.",
        default: "frontmost"
      }
    }
  }
}
```

### ToolRunner 实现

```typescript
private static async screenSense(input: any): Promise<ToolResult> {
  try {
    const { execSync } = await import('child_process')
    const output = execSync('agent-control -p macos snapshot', {
      encoding: 'utf8',
      timeout: 10000
    })
    
    const snapshot = JSON.parse(output)
    
    // 提取关键信息
    const result = {
      app: snapshot.app || 'Unknown',
      title: snapshot.title || '',
      content: snapshot.text || '',
      url: snapshot.url || null
    }
    
    return { 
      success: true, 
      output: JSON.stringify(result, null, 2)
    }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
```

### 工具翻译

在 `tool-translator.ts` 中添加：

```typescript
case 'screen_sense':
  return '🖥️ 查看屏幕内容'
```

## 验收标准

- [ ] screen_sense 工具能成功调用 agent-control
- [ ] 能正确解析并返回屏幕内容
- [ ] LLM 能在合适的时候主动调用
- [ ] 工具调用在 UI 中正确显示
- [ ] 错误处理完善（权限、超时等）

## 非目标

- 不做截图（agent-control 支持但暂不需要）
- 不做剪贴板（低优先级）
- 不做自动触发（避免隐私问题）
