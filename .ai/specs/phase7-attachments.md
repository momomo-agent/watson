# Phase 7B: Multi-Image & File Attachments (多图片/文件支持)

## WHY

Watson 是本地桌面 app，天然有文件系统访问权限。用户应该能直接拖文件/文件夹进来，AI 通过路径读取内容，不需要上传。图片走 vision API（base64），文件走路径引用。

## 现状

- ChatInput.vue 已支持 drag & drop / paste / file picker（多选）
- `MessageAttachment` 类型已定义（name/type/url/size/width/height）
- ChatInput emit `send` 时带 attachments 参数
- **断点**: `useChatSession.sendMessage()` 只传 `text`，不传 attachments
- **断点**: IPC `chat:send` 只接受 `{ sessionId, text, agentId }`
- **断点**: `ChatSession.sendMessage(text)` 没有 attachments 参数
- `fileToDataUrl` 对大文件会 OOM

## 架构

```
用户拖入文件/图片
  ├── 图片 (image/*): base64 → vision API content block
  ├── 文本文件 (<100KB): 读内容 → 作为 text content 发给 LLM
  ├── 大文件/二进制: 只传路径 → LLM 用 file_read 工具按需读
  └── 文件夹: 列目录树 → 作为 text content 发给 LLM
```

## 任务

### T1: 打通 IPC 层

1. `useChatSession.sendMessage()` 加 `attachments` 参数，传给 `chat:send`
2. IPC `chat:send` handler 接受 `attachments` 字段
3. `ChatSession.sendMessage()` 签名改为 `sendMessage(text, agentId?, attachments?)`

### T2: Attachment 处理策略

文件: 新建 `src/main/infrastructure/attachment-processor.ts`

```typescript
interface ProcessedAttachment {
  type: 'image' | 'text' | 'file_ref' | 'directory'
  // image: base64 data URL for vision
  // text: file content as string
  // file_ref: just the path, LLM uses tools to read
  // directory: tree listing as string
  content: string
  metadata: { name: string; path: string; size: number; mimeType: string }
}
```

处理逻辑：
1. **图片** (image/*): 
   - 从 data URL 或 file path 读取
   - 大于 5MB 的图片先压缩（sharp 或 canvas）
   - 输出 base64 data URL
2. **文本文件** (<100KB, text/* / .md / .ts / .js / .py / .json / .yaml 等):
   - 读取文件内容
   - 输出文件内容字符串
3. **大文件/二进制**:
   - 只记录路径
   - 输出 `[文件: /path/to/file (2.3MB, application/pdf)]`
4. **文件夹**:
   - `fs.readdir` 递归列出（最多 3 层，最多 200 条目）
   - 输出目录树字符串

### T3: 构建 LLM 消息

文件: `src/main/domain/chat-session.ts`

`sendMessage` 里构建用户消息时：
1. 图片 attachment → Anthropic vision content block:
   ```json
   { "type": "image", "source": { "type": "base64", "media_type": "image/png", "data": "..." } }
   ```
2. 文本/目录 attachment → 追加到 text content:
   ```
   用户消息文本

   [附件: filename.ts]
   ```typescript
   文件内容...
   ```
   ```
3. file_ref attachment → 追加提示:
   ```
   [附件: /path/to/large-file.pdf (2.3MB) — 使用 file_read 工具查看内容]
   ```

### T4: 前端文件夹支持

文件: `src/renderer/components/ChatInput.vue`

1. 文件夹拖入检测（`DataTransferItem.webkitGetAsEntry()` 判断 isDirectory）
2. 文件夹拖入时递归收集文件列表
3. 或者：添加"选择文件夹"按钮（`webkitdirectory` attribute）
4. 文件夹显示为单个 attachment chip，显示文件数量
5. 大文件（>10MB）显示警告但不阻止

### T5: Attachment 预览优化

文件: `src/renderer/components/ChatInput.vue` + 消息渲染组件

1. 图片 attachment 显示缩略图预览（在输入框上方）
2. 文件 attachment 显示文件名 + 大小 + 类型图标
3. 文件夹 attachment 显示 📁 + 名称 + 文件数
4. 每个 attachment 有删除按钮
5. 消息气泡里也渲染 attachment（图片内联显示，文件显示为 chip）

### T6: 去掉 fileToDataUrl 的 OOM 风险

文件: `src/renderer/components/ChatInput.vue`

1. 图片：前端只做预览（thumbnail），不转 base64
2. 所有文件传 `file.path`（Electron 的 File 对象有 path 属性）到 main 进程
3. main 进程的 attachment-processor 负责读取和转换
4. 这样大文件不会在 renderer 进程 OOM

## 约束

- 图片走 Anthropic vision API（base64 content block）
- 文件不上传，传路径，LLM 用工具读
- 文件夹列目录树，不递归读所有文件内容
- renderer 进程不读大文件，只传路径给 main
- attachment 数量限制：最多 20 个文件 / 5 张图片（vision API 限制）
