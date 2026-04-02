/**
 * 将工具调用翻译成人话
 */

export function translateToolCall(toolName: string, input: any): string {
  switch (toolName) {
    case 'file_read':
      return `正在读取 ${input.path || '文件'}`
    
    case 'file_write':
      return `正在写入 ${input.path || '文件'}`
    
    case 'shell_exec':
      return '正在执行命令...'
    
    case 'search':
      return `正在搜索 "${input.query || ''}"`
    
    case 'code_exec':
      return '正在运行代码...'
    
    case 'notify':
      return '发送通知'
    
    case 'skill_exec':
      return `正在执行 ${input.skill || 'skill'}`
    
    case 'screen_sense':
      return '🖥️ 查看屏幕内容'
    
    case 'coding_agent':
      return `🤖 派发编码任务: ${input.task || ''}`
    
    default:
      return `正在使用 ${toolName}`
  }
}
