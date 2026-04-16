/**
 * Lightweight structured logger for Watson main process.
 * Wraps console with consistent prefix formatting.
 * Replace with electron-log or similar if file logging is needed.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

let minLevel: LogLevel = process.env.WATSON_LOG_LEVEL as LogLevel || 'info'

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[minLevel]
}

function fmt(tag: string, msg: string): string {
  return `[${tag}] ${msg}`
}

export function createLogger(tag: string) {
  return {
    debug: (msg: string, ...args: unknown[]) => {
      if (shouldLog('debug')) console.debug(fmt(tag, msg), ...args)
    },
    info: (msg: string, ...args: unknown[]) => {
      if (shouldLog('info')) console.log(fmt(tag, msg), ...args)
    },
    warn: (msg: string, ...args: unknown[]) => {
      if (shouldLog('warn')) console.warn(fmt(tag, msg), ...args)
    },
    error: (msg: string, ...args: unknown[]) => {
      if (shouldLog('error')) console.error(fmt(tag, msg), ...args)
    },
  }
}

export function setLogLevel(level: LogLevel): void {
  minLevel = level
}
