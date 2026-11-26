export const copyText = async (text: string): Promise<boolean> => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 剪贴板权限受限时尝试兼容方式。
  }

  // 兼容手机通过局域网 HTTP 访问的情况。
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.readOnly = true
  textarea.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px'

  try {
    document.body.appendChild(textarea)
    textarea.focus({ preventScroll: true })
    textarea.select()
    textarea.setSelectionRange(0, textarea.value.length)
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    textarea.remove()
  }
}

/** PNG 输出分辨率，CSS 参考像素为 96 PPI。 */
const PNG_PPI = 600
const CSS_PPI = 96

/** 把 SVG 栅格化为 PNG，供 macOS 剪贴板使用。 */
const rasterizeSvg = async (svg: string): Promise<Blob> => {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  const canvas = document.createElement('canvas')
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('Cannot decode SVG'))
      image.src = url
    })
    const scale = PNG_PPI / CSS_PPI
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('Cannot rasterize SVG')
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!png) {
      throw new Error('Cannot encode PNG')
    }
    return png
  } finally {
    URL.revokeObjectURL(url)
    canvas.width = canvas.height = 0
  }
}

/** macOS 写入 PNG，其余平台直接写入 SVG。 */
export const copySvgImage = async (svg: string): Promise<boolean> => {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
    return false
  }

  try {
    // macOS 原生应用不识别 Chromium 写入的 public.svg-image，直接写 PNG。
    if (/Mac/.test(navigator.platform)) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'image/png': rasterizeSvg(svg),
        }),
      ])
    } else {
      await navigator.clipboard.write([
        new ClipboardItem({
          'image/svg+xml': new Blob([svg], { type: 'image/svg+xml' }),
        }),
      ])
    }
    return true
  } catch {
    return false
  }
}
