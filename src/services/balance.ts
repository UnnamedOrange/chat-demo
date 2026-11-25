import { create } from 'zustand'
import { fetchBalance } from './api/client.js'
import { useSettings } from './settings.js'

/** 账户余额快照；金额由接口字符串转成数字，币种跟随接口。 */
export type BalanceSnapshot = {
  currency: string
  total: number
  granted: number
  toppedUp: number
  fetchedAt: number
}

type BalanceState = {
  status: 'idle' | 'loading' | 'ready' | 'error'
  snapshot: BalanceSnapshot | null
  error: string | null
}

export const useBalance = create<BalanceState>(() => ({
  status: 'idle',
  snapshot: null,
  error: null,
}))

let pending: Promise<void> | null = null
let pendingKey: string | null = null
/** 当前快照对应的 API Key，换 Key 时先清掉旧余额。 */
let loadedKey: string | null = null
let generation = 0

const toAmount = (value: string): number => {
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : 0
}

/**
 * 查询官方账户余额。
 * 同一 Key 的并发请求合并；换 Key 后旧响应通过 generation 作废，不覆盖新账户的余额。
 */
export const refreshBalance = (): Promise<void> => {
  const apiKey = useSettings.getState().apiKey
  if (!apiKey) {
    generation += 1
    pending = null
    pendingKey = null
    loadedKey = null
    useBalance.setState({ status: 'idle', snapshot: null, error: null })
    return Promise.resolve()
  }
  if (loadedKey !== apiKey) {
    loadedKey = apiKey
    useBalance.setState({ status: 'loading', snapshot: null, error: null })
  }
  if (pending && pendingKey === apiKey) {
    return pending
  }
  const current = ++generation
  pendingKey = apiKey
  useBalance.setState({ status: 'loading', error: null })
  pending = (async () => {
    try {
      const info = await fetchBalance(apiKey)
      if (current !== generation) {
        return
      }
      if (!info) {
        useBalance.setState({ status: 'error', error: 'Balance response is empty' })
        return
      }
      useBalance.setState({
        status: 'ready',
        snapshot: {
          currency: info.currency,
          total: toAmount(info.total_balance),
          granted: toAmount(info.granted_balance),
          toppedUp: toAmount(info.topped_up_balance),
          fetchedAt: Date.now(),
        },
        error: null,
      })
    } catch (error) {
      if (current !== generation) {
        return
      }
      useBalance.setState({
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      })
    } finally {
      if (current === generation) {
        pending = null
        pendingKey = null
      }
    }
  })()
  return pending
}
