/**
 * Convert the rendered Polaroid SVG inside `container` to a PNG and trigger a
 * browser download. Pure client-side, no server, no canvg, no extra deps.
 *
 * Strategy:
 *   1. Find the first <svg> inside `container`
 *   2. Inline external font usage by adding a <style> block via @import
 *   3. Serialize the SVG to a string, wrap it in a Blob with image/svg+xml
 *   4. Draw it onto a 2x DPR canvas via Image (data URL), export as PNG
 *
 * This works in every modern browser. No security pitfalls because we only
 * read SVG we just rendered ourselves; the canvas does NOT taint because the
 * blob URL is same-origin.
 */
export async function downloadPolaroidPng(
  container: HTMLElement | null,
  filename = 'conviction-receipt.png',
  scale = 2,
): Promise<void> {
  if (!container) throw new Error('No Polaroid container provided.');
  const svg = container.querySelector('svg');
  if (!svg) throw new Error('No SVG found inside Polaroid container.');

  const cloned = svg.cloneNode(true) as SVGSVGElement;
  // Make sure the clone has explicit width/height attributes so the canvas
  // knows the intrinsic size even when the source was rendered with CSS.
  const width = parseFloat(cloned.getAttribute('width') ?? `${svg.clientWidth || 320}`);
  const height = parseFloat(cloned.getAttribute('height') ?? `${svg.clientHeight || 480}`);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('Polaroid SVG has no width or height.');
  }
  cloned.setAttribute('width', String(width));
  cloned.setAttribute('height', String(height));
  cloned.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

  // Inject a <style> block that imports the Google Fonts we use, so the PNG
  // matches the on-screen typography. Fall back to system fonts if blocked.
  const fontStyle = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  fontStyle.textContent = `@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,600;0,700;1,600&family=Inter:wght@400;600&family=JetBrains+Mono:wght@400;500&display=swap');`;
  cloned.insertBefore(fontStyle, cloned.firstChild);

  const xml = new XMLSerializer().serializeToString(cloned);
  const svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const img = await loadImage(svgUrl);

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D canvas context.');
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, width, height);

    const pngUrl = canvas.toDataURL('image/png');
    triggerDownload(pngUrl, filename);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error(`Could not load Polaroid image: ${String(e)}`));
    img.src = src;
  });
}

function triggerDownload(href: string, filename: string): void {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
