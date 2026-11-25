import type { ChatModel, MessageUsage } from './api/types.js'
import type { AssistantMessage, CostRates, MessageCost, Session } from './chat/types.js'

/**
 * 官方人民币单价（元 / 百万 token），与 dsh-cost-meter 的 DeepSeek 默认表一致。
 * 峰时按空闲价翻倍；缓存写入没有单独费率，沿用缓存命中价。
 */
const PRICE_TABLE: Record<ChatModel, CostRates> = {
  'deepseek-flash': { cacheHit: 0.02, cacheMiss: 1, output: 4 },
  'deepseek-v4-pro': { cacheHit: 0.15, cacheMiss: 4.5, output: 13.5 },
}

/** 峰时段：UTC 01:00–04:00、06:00–10:00，周末全天按空闲价。 */
const PEAK_WINDOWS: readonly (readonly [number, number])[] = [
  [1, 4],
  [6, 10],
]

const isPeakTime = (at: number): boolean => {
  const date = new Date(at)
  const day = date.getUTCDay()
  if (day === 0 || day === 6) {
    return false
  }
  const hour = date.getUTCHours()
  return PEAK_WINDOWS.some(([start, end]) => hour >= start && hour < end)
}

const ratesAt = (model: ChatModel | null, at: number): { rates: CostRates; peak: boolean } => {
  const base = PRICE_TABLE[model ?? 'deepseek-flash']
  if (!isPeakTime(at)) {
    return { rates: { ...base }, peak: false }
  }
  return {
    peak: true,
    rates: {
      cacheHit: base.cacheHit * 2,
      cacheMiss: base.cacheMiss * 2,
      output: base.output * 2,
    },
  }
}

const nonNegative = (value: number): number => (Number.isFinite(value) ? Math.max(0, value) : 0)

/** 接口偶尔会给出负数或非数字，计价前统一收敛到非负值。 */
const normalizeUsage = (usage: MessageUsage): MessageUsage => ({
  input_tokens: nonNegative(usage.input_tokens),
  cache_creation_input_tokens: nonNegative(usage.cache_creation_input_tokens),
  cache_read_input_tokens: nonNegative(usage.cache_read_input_tokens),
  output_tokens: nonNegative(usage.output_tokens),
})

const totalTokens = (usage: MessageUsage): number =>
  usage.input_tokens +
  usage.cache_creation_input_tokens +
  usage.cache_read_input_tokens +
  usage.output_tokens

/** 计算一次请求的人民币费用；没有 token 用量时返回 null。 */
export const calculateMessageCost = (
  model: ChatModel | null,
  usage: MessageUsage,
  at: number,
  requestId: string
): MessageCost | null => {
  const tokens = normalizeUsage(usage)
  if (totalTokens(tokens) === 0) {
    return null
  }
  const { rates, peak } = ratesAt(model, at)
  const amount =
    (tokens.input_tokens * rates.cacheMiss +
      tokens.cache_creation_input_tokens * rates.cacheHit +
      tokens.cache_read_input_tokens * rates.cacheHit +
      tokens.output_tokens * rates.output) /
    1_000_000
  return {
    requestId,
    at,
    amount,
    currency: 'CNY',
    peak,
    rates,
    usage: tokens,
  }
}

/** 请求结束后把本次费用追加到回复；同一请求 ID 只记一次。 */
export const withReplyCost = (
  reply: AssistantMessage,
  requestId: string | undefined,
  at: number
): AssistantMessage => {
  if (!requestId || !reply.usage || at <= 0) {
    return reply
  }
  if (reply.costs?.some((cost) => cost.requestId === requestId)) {
    return reply
  }
  const cost = calculateMessageCost(reply.model, reply.usage, at, requestId)
  return cost ? { ...reply, costs: [...(reply.costs ?? []), cost] } : reply
}

export type MessageBilling = {
  amount: number
  calls: number
  tokens: {
    input: number
    cacheRead: number
    cacheCreation: number
    output: number
  }
  entries: MessageCost[]
}

/** 汇总一条回复的费用；续写产生的多次请求按时间排列。 */
export const getMessageBilling = (message: AssistantMessage): MessageBilling => {
  const entries = [...(message.costs ?? [])].sort((a, b) => a.at - b.at)
  const tokens = { input: 0, cacheRead: 0, cacheCreation: 0, output: 0 }
  let amount = 0
  for (const cost of entries) {
    amount += cost.amount
    tokens.input += cost.usage.input_tokens
    tokens.cacheRead += cost.usage.cache_read_input_tokens
    tokens.cacheCreation += cost.usage.cache_creation_input_tokens
    tokens.output += cost.usage.output_tokens
  }
  return { amount, calls: entries.length, tokens, entries }
}

/** 汇总一个会话全部分支的费用；用于侧边栏累计花费。 */
export const getSessionCost = (session: Session): number => {
  let amount = 0
  for (const message of session.messages) {
    if (message.role !== 'assistant') {
      continue
    }
    for (const cost of message.costs ?? []) {
      amount += cost.amount
    }
  }
  return amount
}

/** 会话与单次请求金额：固定四位小数，过小金额给出下限提示。 */
export const formatCost = (value: number): string =>
  value > 0 && value < 0.0001 ? '<¥0.0001' : `¥${value.toFixed(4)}`

/** 余额金额按接口币种显示，保留两位小数。 */
export const formatBalance = (value: number, currency: string): string => {
  const code = currency.toUpperCase()
  const symbol = code === 'CNY' ? '¥' : code === 'USD' ? '$' : code === 'EUR' ? '€' : `${code} `
  return `${symbol}${value.toFixed(2)}`
}

/** Token 数量使用 K / M 缩写，去掉无意义的 .0。 */
export const formatTokens = (value: number): string => {
  if (value < 1000) {
    return String(Math.round(value))
  }
  if (value < 999_950) {
    return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}K`
  }
  return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
}

/** 费用栏中的时间统一用两位时分，语言跟随应用设置。 */
export const formatCostTime = (at: number, locale: string): string =>
  new Date(at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
