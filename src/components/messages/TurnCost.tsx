import { useMemo, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import {
  formatCost,
  formatCostTime,
  formatTokens,
  getMessageBilling,
} from '../../services/billing.js'
import type { AssistantMessage } from '../../services/chat/types.js'
import { useSettings } from '../../services/settings.js'
import { IconChevronDownOutline14, IconChevronRightOutline14 } from '../base/icons.js'
import styles from './TurnCost.module.css'

/**
 * 每条回答下方的本轮费用：默认只显示金额，展开后列出 token 与各次请求。
 * 费用快照随消息保存，重新打开会话后仍可直接显示。
 */
export const TurnCost = ({ message }: { message: AssistantMessage }) => {
  const t = useTranslate()
  const locale = useSettings((state) => state.locale)
  const [open, setOpen] = useState(false)
  const billing = useMemo(() => getMessageBilling(message), [message])
  if (billing.calls === 0) {
    return null
  }
  const single = billing.entries.length === 1 ? billing.entries[0] : null
  return (
    <div className={styles.container}>
      <button
        type="button"
        className={styles.summary}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={styles.label}>{t('turnCostLabel')}</span>
        <span className={styles.value}>{formatCost(billing.amount)}</span>
        {open ? <IconChevronDownOutline14 /> : <IconChevronRightOutline14 />}
      </button>
      {open ? (
        <div className={styles.panel} role="region" aria-label={t('costDetails')}>
          <div className={styles.panelTitle}>{t('costDetails')}</div>
          <div className={styles.section}>
            <div className={styles.row}>
              <span>{t('turnCostLabel')}</span>
              <span className={styles.amount}>{formatCost(billing.amount)}</span>
            </div>
            <div className={styles.hint}>
              {t('costInput')} {formatTokens(billing.tokens.input)} · {t('costCache')}{' '}
              {formatTokens(billing.tokens.cacheRead + billing.tokens.cacheCreation)} ·{' '}
              {t('costOutput')} {formatTokens(billing.tokens.output)}
            </div>
            {single ? (
              <div className={styles.hint}>
                {formatCostTime(single.at, locale)}
                {single.peak ? ` · ${t('costPeak')}` : ''}
              </div>
            ) : null}
          </div>
          {billing.entries.length > 1 ? (
            <div className={styles.section}>
              <div className={styles.list}>
                {billing.entries.map((cost, index) => (
                  <div key={cost.requestId} className={styles.entry}>
                    <div className={styles.entryHead}>
                      <span className={styles.entryTitle}>
                        {t('costRequest', { index: index + 1 })}
                        {cost.peak ? <span className={styles.peak}>{t('costPeak')}</span> : null}
                        <span className={styles.entryTime}>{formatCostTime(cost.at, locale)}</span>
                      </span>
                      <span className={styles.amount}>{formatCost(cost.amount)}</span>
                    </div>
                    <div className={styles.hint}>
                      {t('costInput')} {formatTokens(cost.usage.input_tokens)} · {t('costCache')}{' '}
                      {formatTokens(
                        cost.usage.cache_read_input_tokens + cost.usage.cache_creation_input_tokens
                      )}{' '}
                      · {t('costOutput')} {formatTokens(cost.usage.output_tokens)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div className={styles.footnote}>{t('costEstimated')}</div>
        </div>
      ) : null}
    </div>
  )
}
