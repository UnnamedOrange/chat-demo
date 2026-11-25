import clsx from 'clsx'
import { useEffect } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { refreshBalance, useBalance } from '../../services/balance.js'
import { formatBalance, formatCost, formatCostTime } from '../../services/billing.js'
import { useSettings } from '../../services/settings.js'
import { ensureUsage, useUsage } from '../../services/usage.js'
import { IconRefreshOutline16 } from '../base/icons.js'
import { Tooltip } from '../base/Tooltip.js'
import styles from './BalanceMeter.module.css'

/**
 * 侧边栏余额：显示当前 API Key 的账户余额，点击刷新。
 * 桌面端悬停可查看充值、赠送与更新时间；移动端不显示悬停提示，点击仍会刷新。
 */
export const BalanceMeter = () => {
  const t = useTranslate()
  const locale = useSettings((state) => state.locale)
  const status = useBalance((state) => state.status)
  const snapshot = useBalance((state) => state.snapshot)
  const total = useUsage((state) => state.total)
  const usageStatus = useUsage((state) => state.status)
  useEffect(() => {
    void ensureUsage()
  }, [])
  const costText = total === 0 && usageStatus !== 'ready' ? '—' : formatCost(total)
  const balanceText = snapshot
    ? formatBalance(snapshot.total, snapshot.currency)
    : status === 'loading'
      ? t('balanceLoading')
      : status === 'error'
        ? t('balanceLoadFailed')
        : '—'
  const details = [
    `${t('balanceLabel')} ${balanceText}`,
    ...(snapshot
      ? [
          `${t('balanceToppedUp')} ${formatBalance(snapshot.toppedUp, snapshot.currency)}`,
          `${t('balanceGranted')} ${formatBalance(snapshot.granted, snapshot.currency)}`,
          t('balanceUpdatedAt', { time: formatCostTime(snapshot.fetchedAt, locale) }),
        ]
      : []),
    ...(status === 'error' && snapshot ? [t('balanceLoadFailed')] : []),
    status === 'loading' ? t('balanceRefreshing') : t('balanceRefresh'),
  ].join(' · ')
  return (
    <div className={styles.root}>
      <div className={styles.cumulative}>
        <span className={styles.cumulativeLabel}>{t('cumulativeCostLabel')}</span>
        <span className={styles.cumulativeAmount}>{costText}</span>
        <span className={styles.cumulativeSpacer} aria-hidden />
      </div>
      <Tooltip content={details}>
        <button
          type="button"
          className={styles.balance}
          aria-label={details}
          aria-busy={status === 'loading'}
          onClick={() => void refreshBalance()}
        >
          <span className={styles.label}>{t('balanceLabel')}</span>
          <span className={styles.amount}>{balanceText}</span>
          <span className={clsx(styles.refresh, status === 'loading' && styles.spinning)}>
            <IconRefreshOutline16 />
          </span>
        </button>
      </Tooltip>
    </div>
  )
}
