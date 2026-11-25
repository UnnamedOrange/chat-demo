import { create } from 'zustand'
import { getSessionCost } from './billing.js'
import * as db from './chat/db.js'
import type { Session } from './chat/types.js'

/** 本机累计花费缓存；只用于侧边栏显示，不写入历史导出。 */
const CACHE_KEY = 'chat-demo:cumulative-cost'

const readCache = (): number => {
  try {
    const value = Number(localStorage.getItem(CACHE_KEY))
    return Number.isFinite(value) && value >= 0 ? value : 0
  } catch {
    return 0
  }
}

const writeCache = (value: number) => {
  try {
    localStorage.setItem(CACHE_KEY, String(value))
  } catch {
    // 存储不可用时只在内存中生效
  }
}

const cached = readCache()
const useUsage = create<{ status: 'idle' | 'loading' | 'ready' | 'error'; total: number }>(() => ({
  status: 'idle',
  total: cached,
}))

/** 每个已扫描会话的费用；保存后只更新对应会话，不重复读取整库。 */
const sessionCosts = new Map<string, number>()
let total = cached
let initialized = false
let generation = 0

const commit = (nextTotal: number) => {
  total = Math.max(0, nextTotal)
  writeCache(total)
  useUsage.setState({ status: 'ready', total })
}

/**
 * 从已落盘的会话费用快照重建累计表。
 * 只在首次显示、导入或清空历史时调用；日常回复走增量更新。
 */
export const refreshUsage = (): Promise<void> => {
  const current = ++generation
  useUsage.setState({ status: 'loading' })
  return (async () => {
    try {
      const sessions = await db.loadAllSessions()
      const nextCosts = new Map<string, number>()
      let nextTotal = 0
      for (const session of sessions) {
        const cost = getSessionCost(session)
        nextCosts.set(session.id, cost)
        nextTotal += cost
      }
      if (current !== generation) {
        return
      }
      sessionCosts.clear()
      for (const [id, cost] of nextCosts) {
        sessionCosts.set(id, cost)
      }
      initialized = true
      commit(nextTotal)
    } catch {
      if (current === generation) {
        useUsage.setState({ status: 'error' })
      }
    }
  })()
}

/** 首次显示时建立累计表；侧边栏反复开合不会重复扫库。 */
export const ensureUsage = (): Promise<void> => {
  if (initialized) {
    return Promise.resolve()
  }
  return refreshUsage()
}

/** 单个会话保存后增量更新；只遍历该会话的消息。 */
export const updateSessionUsage = (session: Session): void => {
  if (!initialized) {
    void refreshUsage()
    return
  }
  const next = getSessionCost(session)
  const previous = sessionCosts.get(session.id) ?? 0
  if (next === previous) {
    return
  }
  sessionCosts.set(session.id, next)
  commit(total + next - previous)
}

/** 会话删除后增量移除。 */
export const removeSessionUsage = (id: string): void => {
  if (!initialized) {
    void refreshUsage()
    return
  }
  const previous = sessionCosts.get(id)
  if (previous === undefined) {
    return
  }
  sessionCosts.delete(id)
  commit(total - previous)
}

export { useUsage }
