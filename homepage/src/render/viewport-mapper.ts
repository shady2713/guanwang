/**
 * Encoded-frame coordinates -> stage pixels.
 *
 * One convention only: the overlay SVG is placed on the video content rectangle
 * and uses the encoded frame as its viewBox, so every annotation is projected
 * exactly the way the browser projects the video frame itself.
 */
import type { Box01, Point01 } from '../contracts/domain'

export interface Viewport {
  /** Encoded frame size of the rendition actually loaded. */
  encodedWidth: number
  encodedHeight: number
  containerWidth: number
  containerHeight: number
  offsetX: number
  offsetY: number
  contentWidth: number
  contentHeight: number
}

export function computeViewport(
  encodedWidth: number,
  encodedHeight: number,
  containerWidth: number,
  containerHeight: number,
): Viewport {
  if (containerWidth <= 0 || containerHeight <= 0) {
    return {
      encodedWidth,
      encodedHeight,
      containerWidth,
      containerHeight,
      offsetX: 0,
      offsetY: 0,
      contentWidth: 0,
      contentHeight: 0,
    }
  }
  const scale = Math.min(containerWidth / encodedWidth, containerHeight / encodedHeight)
  const contentWidth = encodedWidth * scale
  const contentHeight = encodedHeight * scale
  return {
    encodedWidth,
    encodedHeight,
    containerWidth,
    containerHeight,
    offsetX: (containerWidth - contentWidth) / 2,
    offsetY: (containerHeight - contentHeight) / 2,
    contentWidth,
    contentHeight,
  }
}

export function pointToStage(viewport: Viewport, point: Point01): { x: number; y: number } {
  return {
    x: viewport.offsetX + point.x * viewport.contentWidth,
    y: viewport.offsetY + point.y * viewport.contentHeight,
  }
}

export function boxToStage(viewport: Viewport, box: Box01): { x: number; y: number; width: number; height: number } {
  return {
    x: viewport.offsetX + box.x * viewport.contentWidth,
    y: viewport.offsetY + box.y * viewport.contentHeight,
    width: box.width * viewport.contentWidth,
    height: box.height * viewport.contentHeight,
  }
}
