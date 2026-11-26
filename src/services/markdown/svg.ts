const SAFE_HREF = /^(?:#|data:image\/)/i

/** 移除可执行内容，只保留图形本身。 */
const sanitize = (root: Element) => {
  root.querySelectorAll('script, foreignObject').forEach((element) => element.remove())
  for (const element of [root, ...root.querySelectorAll('*')]) {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase()
      // 事件属性会在插入页面后执行；href 只保留文档内引用和内联图片。
      if (
        name.startsWith('on') ||
        ((name === 'href' || name === 'xlink:href') && !SAFE_HREF.test(attribute.value))
      ) {
        element.removeAttributeNode(attribute)
      }
    }
  }
}

/** 解析 SVG 源码并清理可执行内容，解析失败时返回 null。 */
export const renderSvg = (code: string): string | null => {
  if (!code.trim()) {
    return null
  }

  try {
    const parsed = new DOMParser().parseFromString(code, 'image/svg+xml')
    if (parsed.querySelector('parsererror')) {
      return null
    }

    const svg = parsed.documentElement
    if (svg.localName !== 'svg') {
      return null
    }

    sanitize(svg)
    if (!svg.hasAttribute('xmlns')) {
      svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    }
    return new XMLSerializer().serializeToString(svg)
  } catch {
    return null
  }
}
