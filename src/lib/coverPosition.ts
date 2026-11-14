// Shared cover photo positioning utility.
//
// Ensures the repositioning preview (CoverRepositionModal) and the final
// profile cover render (CoverPhotoEditor) use identical calculations, so the
// saved composition matches what the user saw in the preview.
//
// With background-size: cover, background-position: center Y% (0-100, 50 =
// centered) produces the same image composition regardless of container size.
// Storing a normalized percentage (instead of raw pixels) makes the position
// container-agnostic.

/**
 * Convert a stored cover_position_y value to a normalized percentage (0-100).
 * 50 = vertically centered, 0 = top-aligned, 100 = bottom-aligned.
 *
 * Backward compatibility: values already in 0-100 are treated as the new
 * percentage format. Legacy pixel values (old slider range ±200px) are
 * converted: 0 (old default, meant center) -> 50.
 */
export function normalizeCoverPosition(
  storedValue: number | null | undefined
): number {
  if (storedValue === null || storedValue === undefined) {
    return 50;
  }
  // Legacy default: 0 meant center in the old pixel-based format.
  if (storedValue === 0) {
    return 50;
  }
  // New format: already a 0-100 percentage (1-100, 0 handled above).
  if (storedValue > 0 && storedValue <= 100) {
    return storedValue;
  }
  // Legacy format: pixel offset from the old ±200px slider range.
  return Math.max(0, Math.min(100, 50 + (storedValue / 200) * 50));
}

/**
 * CSS background-position for a cover image.
 * positionPercent: 0-100 where 50 = vertically centered.
 */
export function getCoverBackgroundPosition(positionPercent: number): string {
  const clamped = Math.max(0, Math.min(100, positionPercent));
  return `center ${clamped}%`;
}

/**
 * Maximum pixel shift from center that still keeps the image covering the
 * container under background-size: cover. Returns the max offset in either
 * direction (positive = down, negative = up).
 */
export function getCoverMaxMovement(
  imageWidth: number,
  imageHeight: number,
  containerWidth: number,
  containerHeight: number
): number {
  if (containerWidth === 0 || containerHeight === 0) return 0;
  const scale = Math.max(
    containerWidth / imageWidth,
    containerHeight / imageHeight
  );
  const scaledHeight = imageHeight * scale;
  const overflowY = Math.max(0, scaledHeight - containerHeight);
  return overflowY / 2;
}

/**
 * Convert a pixel offset from center to a normalized percentage (0-100).
 */
export function pxToPositionPercent(positionPx: number, maxMovement: number): number {
  if (maxMovement <= 0) return 50;
  return Math.max(0, Math.min(100, 50 + (positionPx / maxMovement) * 50));
}

/**
 * Convert a normalized percentage (0-100) back to a pixel offset for the
 * slider, given current container dimensions.
 */
export function positionPercentToPx(
  positionPercent: number,
  maxMovement: number
): number {
  if (maxMovement <= 0) return 0;
  return ((positionPercent - 50) / 50) * maxMovement;
}
