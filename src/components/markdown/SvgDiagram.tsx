import { useTranslate } from '../../i18n/index.js'
import { memo, useMemo, useRef } from 'react'
import { renderSvg } from '../../services/markdown/svg.js'

/** 直接绘制 SVG；流式阶段保留上次有效图，回答结束后才显示渲染错误。 */
export const SvgDiagram = memo(function SvgDiagram({
  code,
  loading,
}: {
  code: string
  loading: boolean
}) {
  const t = useTranslate()
  const svg = useMemo(() => renderSvg(code), [code])
  // 流式片段的末行可能尚未构成完整标签，保留上一次绘制成功的图形。
  const resultRef = useRef({ svg: '', failedCode: null as string | null })
  if (svg) {
    resultRef.current = { svg, failedCode: null }
  } else if (!loading) {
    resultRef.current = { svg: '', failedCode: code }
  }
  const result = resultRef.current

  if (!code.trim() || !result.svg) {
    return (
      <div className="md-svg-status" role="status">
        {!loading && !code.trim()
          ? t('svgEmpty')
          : !loading && result.failedCode === code
            ? t('svgRenderFail')
            : t('svgLoading')}
      </div>
    )
  }

  return <div className="md-svg-diagram" dangerouslySetInnerHTML={{ __html: result.svg }} />
})
