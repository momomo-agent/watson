# Watson 设计诊断 — 从"又一个聊天窗口"到"最美观最易用的本地 AI 助手"

## 现状问题（按严重程度排序）

### 1. 没有辨识度
打开 Watson 的第一感受是"又一个深色聊天 app"。跟 Claude Desktop、ChatGPT Desktop 没有视觉区分度。
- 空状态只有一个蓝色方块 "W" + "How can I help you today?" — 这是每个 AI app 的默认文案
- 没有品牌感，没有性格

### 2. Sidebar 太重
- 左侧 sidebar 占了 ~25% 宽度，但大部分时间只有 1-3 个 session
- session 列表的信息密度低：标题 + 时间 + 一行预览，但预览经常是无意义的截断
- "Sessions" 标题 + "+" 按钮 + "Settings" 按钮，三个元素占了 sidebar 头尾

### 3. 消息气泡太传统
- 用户消息有蓝色背景气泡，AI 消息无背景 — 这是 2020 年的聊天 UI 范式
- 消息之间间距不够，视觉上挤在一起
- 代码块样式还行（有 header + copy），但跟消息体的视觉层次不够分明

### 4. 输入区域平庸
- 底部输入框是标准 textarea + 发送按钮
- 没有附件预览区、没有 agent 选择的视觉反馈
- model selector "🤖Watson▼" 放在输入框左边，视觉上跟输入框抢注意力

### 5. Settings 面板粗糙
- 全屏覆盖式 settings，打开后完全遮挡对话
- 表单排列是最基础的 label + input 堆叠
- 没有分组、没有视觉层次

---

## 设计方向

### 核心理念：Calm + Capable
Watson 不是要炫技，是要让人觉得"这个工具很安静但很强"。像一个好的书桌台灯——你不会注意到它，但它让一切都看得清楚。

### 视觉语言
- **配色**：放弃纯深色。用 warm neutral 底色（不是冷灰），单一强调色（amber/warm gold 而非蓝色）
- **排版**：正文 Geist Sans，代码 Geist Mono。标题用 weight 区分层次，不靠 size
- **圆角**：统一 12px（大容器）/ 8px（卡片）/ 4px（按钮/input）
- **阴影**：几乎不用。用 border + 微妙的 background 层次替代

### 布局重构
1. **Sidebar → 可收起的窄轨道**：默认只显示 session 图标/首字母，hover 展开。或者干脆默认隐藏，Cmd+E 呼出
2. **消息区域全宽**：消息内容 max-width 680px 居中，两侧留白
3. **输入区域升级**：浮动在底部，有呼吸感的 padding，附件/agent 选择集成进输入框内部
4. **空状态重设计**：不是 logo + 文案，而是 3-4 个快捷入口（"分析屏幕"、"写代码"、"搜索文件"）

### 交互升级
1. **消息不用气泡**：用户消息右对齐纯文本（微妙背景），AI 消息左对齐无背景。参考 Linear 的评论区风格
2. **工具调用可视化**：不是展开/折叠的文本块，而是带图标的状态卡片（running → complete）
3. **Streaming 体验**：打字光标 + 段落渐入，不是逐字追加

---

## 执行计划（分三批）

### 第一批：视觉基础（theme + layout）
- 新 theme.css：warm neutral 色板 + Geist 字体 + 统一间距
- Sidebar 改为可收起窄轨道
- 消息区域 max-width 居中 + 去掉气泡
- 输入区域重设计

### 第二批：组件打磨
- 空状态重设计（快捷入口）
- 工具调用卡片化
- Settings 改为侧滑面板（不全屏覆盖）
- 代码块优化（更好的 header、行号可选）

### 第三批：动效 + 细节
- 消息出场动画（fade + slide）
- Sidebar 展开/收起动画
- 输入框 focus 状态
- 骨架屏 loading

---

## 竞品参考
- **Raycast AI**：最好的"融入系统"体验，但太轻量
- **Cursor**：编码场景的深度集成，但 UI 不够美
- **Linear**：最好的 SaaS 设计品味，评论区/消息流值得参考
- **Arc Browser**：sidebar 的收起/展开交互
- **Apple Notes**：简洁但不简陋的典范
