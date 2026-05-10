/**
 * Convert the rendered Polaroid SVG inside `container` to a PNG and trigger
 * a browser download. Pure client-side, no server, no canvas hosting.
 *
 * Strategy:
 *   1. Find the first <svg> inside `container`.
 *   2. Deep-clone the live SVG so we don't mutate the rendered version.
 *   3. Resolve EVERY CSS-variable reference (`var(--c-x)`) to a concrete
 *      color value on the clone. Canvas2D can't substitute CSS vars on a
 *      serialized SVG, so without this step the PNG comes out blank or
 *      with stray "var(--c-paper)" strings rendered as text.
 *   4. Inline computed font + fill on every <text> / <tspan> so the
 *      rasterizer (which runs in an isolated document context with no
 *      access to the page's stylesheets) still picks the right typography.
 *   5. Strip any embedded <style> tags from the clone — they can sneak
 *      cross-origin `@import` references in and any cross-origin fetch
 *      during raster taints the canvas and blocks `toDataURL`.
 *   6. Wrap in a Blob, draw to a 2x DPR canvas, export as PNG.
 *
 * Two important constraints that this implementation respects:
 *
 *   - NO `<foreignObject>` in the source SVG. Chrome taints any canvas
 *     that rasterizes an SVG containing a foreignObject, regardless of
 *     the foreignObject's content. The Polaroid caption is therefore
 *     rendered as native SVG <text> elements (see Polaroid.tsx).
 *
 *   - NO cross-origin `@import` (e.g. Google Fonts) embedded in the
 *     serialized SVG. Such fetches taint the canvas too. We accept a
 *     small typography degradation in the exported PNG (system font
 *     fallback instead of Fraunces / JetBrains Mono) in exchange for a
 *     reliably exportable raster in every browser.
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
  const width = parseFloat(cloned.getAttribute('width') ?? `${svg.clientWidth || 320}`);
  const height = parseFloat(cloned.getAttribute('height') ?? `${svg.clientHeight || 480}`);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('Polaroid SVG has no width or height.');
  }
  cloned.setAttribute('width', String(width));
  cloned.setAttribute('height', String(height));
  cloned.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

  // 1) Resolve CSS variables on every attribute that takes a color or url().
  resolveCssVarsOnTree(cloned, svg);

  // 2) Inline computed font + fill on every <text> / <tspan>. Without
  // this the rasterizer falls back to "Times" black for every text node,
  // because attribute-only styling on text doesn't always survive
  // serialization across the SVG-as-Image boundary.
  inlineTextNodeStyles(cloned, svg);

  // 3) Remove any nested <style> tags. They can sneak in `@import` rules
  // or other cross-origin references that taint the canvas during raster.
  cloned.querySelectorAll('style').forEach((node) => node.remove());

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

/**
 * Walk the cloned SVG tree and replace every occurrence of a `var(--c-*)`
 * reference (in attributes like fill/stroke/stop-color OR in style props)
 * with the actual computed value. We read the value from the LIVE element
 * via getComputedStyle, then write it back to the clone's attribute.
 *
 * Why we read from the live element instead of resolving against the root:
 * a CSS variable can be set on any ancestor of the live element, not just
 * the root. The browser's computed-style API handles cascading correctly.
 */
function resolveCssVarsOnTree(clonedRoot: SVGSVGElement, liveRoot: SVGSVGElement) {
  // Map each cloned descendant to its corresponding live one so we can ask
  // the live element for its computed style. We rely on identical DOM
  // structure (the clone is a deep copy and we haven't mutated the tree
  // yet).
  const liveDescendants = liveRoot.querySelectorAll('*');
  const clonedDescendants = clonedRoot.querySelectorAll('*');
  const len = Math.min(liveDescendants.length, clonedDescendants.length);

  const COLOR_ATTRS = ['fill', 'stroke', 'stop-color', 'flood-color'];

  for (let i = 0; i < len; i++) {
    const live = liveDescendants[i] as Element;
    const node = clonedDescendants[i] as Element;
    const computed = window.getComputedStyle(live);

    for (const attr of COLOR_ATTRS) {
      const val = node.getAttribute(attr);
      if (val && val.includes('var(')) {
        // Read the computed value (which has CSS vars resolved already).
        const resolved = computed.getPropertyValue(attr === 'stop-color' ? 'stop-color' : attr);
        if (resolved) node.setAttribute(attr, resolved.trim());
      }
    }

    // Also walk the inline `style` attribute if present.
    const style = node.getAttribute('style');
    if (style && style.includes('var(')) {
      const resolved = style.replace(/var\(\s*(--[a-z0-9-]+)\s*(?:,[^)]*)?\)/gi, (_m, varName) => {
        const v = computed.getPropertyValue(varName);
        return v ? v.trim() : '#000';
      });
      node.setAttribute('style', resolved);
    }
  }

  // The root SVG itself can carry a CSS var in its inline style.filter (we
  // set drop-shadow with a CSS var color). Resolve that too.
  const rootStyle = clonedRoot.getAttribute('style');
  if (rootStyle && rootStyle.includes('var(')) {
    const rootComputed = window.getComputedStyle(liveRoot);
    const resolved = rootStyle.replace(/var\(\s*(--[a-z0-9-]+)\s*(?:,[^)]*)?\)/gi, (_m, varName) => {
      const v = rootComputed.getPropertyValue(varName);
      return v ? v.trim() : '#000';
    });
    clonedRoot.setAttribute('style', resolved);
  }
}

/**
 * Walk every SVG <text> and <tspan> descendant and copy its computed
 * font-family, font-size, font-weight, font-style, letter-spacing, and
 * fill onto the cloned node as explicit attributes/inline-style props.
 * The SVG-as-Image rasterization path cannot see the page's CSS, so any
 * text that relied on inherited or stylesheet-driven typography would
 * fall back to the rasterizer default. After this pass, every text node
 * carries the values it needs to render correctly on canvas.
 */
function inlineTextNodeStyles(cloned: SVGSVGElement, live: SVGSVGElement) {
  const liveTexts = live.querySelectorAll('text, tspan');
  const clonedTexts = cloned.querySelectorAll('text, tspan');
  const n = Math.min(liveTexts.length, clonedTexts.length);
  for (let i = 0; i < n; i++) {
    const lv = liveTexts[i] as SVGElement;
    const cl = clonedTexts[i] as SVGElement;
    const cs = window.getComputedStyle(lv);
    cl.setAttribute('font-family', cs.fontFamily);
    cl.setAttribute('font-size', cs.fontSize);
    cl.setAttribute('font-weight', cs.fontWeight);
    if (cs.fontStyle && cs.fontStyle !== 'normal') {
      cl.setAttribute('font-style', cs.fontStyle);
    }
    if (cs.letterSpacing && cs.letterSpacing !== 'normal') {
      cl.setAttribute('letter-spacing', cs.letterSpacing);
    }
    // Only force fill if the clone doesn't already declare one. Several
    // text nodes rely on per-element fill (e.g. signature color); we
    // don't want to overwrite those with the computed value, which can
    // be unexpectedly inherited from an ancestor.
    if (!cl.getAttribute('fill') && cs.fill && cs.fill !== 'rgb(0, 0, 0)') {
      cl.setAttribute('fill', cs.fill);
    }
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
