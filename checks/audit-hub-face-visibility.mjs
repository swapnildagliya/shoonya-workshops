// Verifies that hub card faces remain visible in the rendered desktop and mobile crops.
// Run from deploy/: NODE_PATH=/path/to/node_modules node checks/audit-hub-face-visibility.mjs
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deploy = path.resolve(__dirname, '..');

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

const PAGES = [
  { name: 'EN hub', file: 'index.html', selector: '#card-ccsi [data-critical-face]' },
  { name: 'NL hub', file: 'nl/index.html', selector: '#card-ccsi [data-critical-face]' },
];

const MIN_VISIBLE_RATIO = 0.98;
const MIN_EDGE_MARGIN = 8;
const MAX_OCCLUDED_SAMPLE_RATIO = 0;

async function auditFace(page, item) {
  return page.evaluate(({ selector, minVisibleRatio, minEdgeMargin, maxOccludedSampleRatio }) => {
    const img = document.querySelector(selector);
    if (!img) throw new Error(`Missing critical face image: ${selector}`);
    const media = img.closest('.panel-media');
    const badge = media?.querySelector('.panel-date') || null;
    const box = String(img.dataset.faceBox || '').split(',').map(Number);
    if (box.length !== 4 || box.some((n) => !Number.isFinite(n))) {
      throw new Error(`Invalid data-face-box on ${selector}`);
    }

    const container = media.getBoundingClientRect();
    const imageBox = img.getBoundingClientRect();
    const naturalWidth = img.naturalWidth;
    const naturalHeight = img.naturalHeight;
    const fitScale = Math.max(imageBox.width / naturalWidth, imageBox.height / naturalHeight);
    const renderedWidth = naturalWidth * fitScale;
    const renderedHeight = naturalHeight * fitScale;
    const pos = (() => {
      const raw = getComputedStyle(img).objectPosition.trim().split(/\s+/);
      const norm = (part, fallback) => {
        if (!part) return fallback;
        if (part === 'left' || part === 'top') return 0;
        if (part === 'center') return 0.5;
        if (part === 'right' || part === 'bottom') return 1;
        if (part.endsWith('%')) return parseFloat(part) / 100;
        return fallback;
      };
      return { x: norm(raw[0], 0.5), y: norm(raw[1], 0.5) };
    })();
    const imageLeft = imageBox.left + (imageBox.width - renderedWidth) * pos.x;
    const imageTop = imageBox.top + (imageBox.height - renderedHeight) * pos.y;
    const face = {
      left: imageLeft + box[0] * naturalWidth * fitScale,
      top: imageTop + box[1] * naturalHeight * fitScale,
      width: box[2] * naturalWidth * fitScale,
      height: box[3] * naturalHeight * fitScale,
    };
    face.right = face.left + face.width;
    face.bottom = face.top + face.height;

    const visible = (() => {
      const left = Math.max(face.left, container.left, 0);
      const top = Math.max(face.top, container.top, 0);
      const right = Math.min(face.right, container.right, window.innerWidth);
      const bottom = Math.min(face.bottom, container.bottom, window.innerHeight);
      if (right <= left || bottom <= top) return { ratio: 0, edgeMargin: -Infinity };
      const visibleArea = (right - left) * (bottom - top);
      const totalArea = face.width * face.height;
      const edgeMargin = Math.min(
        face.left - container.left,
        face.top - container.top,
        container.right - face.right,
        container.bottom - face.bottom
      );
      return { ratio: visibleArea / totalArea, edgeMargin };
    })();

    const occlusion = (() => {
      let total = 0;
      let occluded = 0;
      const blockers = new Map();
      for (let row = 1; row <= 5; row += 1) {
        for (let col = 1; col <= 5; col += 1) {
          const x = face.left + (face.width * col) / 6;
          const y = face.top + (face.height * row) / 6;
          total += 1;
          if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) {
            occluded += 1;
            blockers.set('viewport', (blockers.get('viewport') || 0) + 1);
            continue;
          }
          const stack = document.elementsFromPoint(x, y);
          const top = stack[0];
          const imageVisible = top === img || (top && media.contains(top) && !top.closest('.panel-date'));
          if (!imageVisible) {
            occluded += 1;
            const label = top
              ? `${top.tagName.toLowerCase()}${top.id ? `#${top.id}` : ''}${top.className ? `.${String(top.className).trim().replace(/\s+/g, '.')}` : ''}`
              : 'none';
            blockers.set(label, (blockers.get(label) || 0) + 1);
          }
        }
      }
      return {
        ratio: total ? occluded / total : 1,
        blockers: Array.from(blockers.entries()).map(([label, count]) => ({ label, count })),
      };
    })();

    const badgeOverlapRatio = (() => {
      if (!badge) return 0;
      const br = badge.getBoundingClientRect();
      const left = Math.max(face.left, br.left);
      const top = Math.max(face.top, br.top);
      const right = Math.min(face.right, br.right);
      const bottom = Math.min(face.bottom, br.bottom);
      if (right <= left || bottom <= top) return 0;
      return ((right - left) * (bottom - top)) / (face.width * face.height);
    })();

    return {
      src: img.getAttribute('src'),
      objectPosition: getComputedStyle(img).objectPosition,
      naturalWidth,
      naturalHeight,
      container,
      face,
      visibleRatio: visible.ratio,
      edgeMargin: visible.edgeMargin,
      badgeOverlapRatio,
      occludedSampleRatio: occlusion.ratio,
      blockers: occlusion.blockers,
      pass:
        visible.ratio >= minVisibleRatio &&
        visible.edgeMargin >= minEdgeMargin &&
        badgeOverlapRatio === 0 &&
        occlusion.ratio <= maxOccludedSampleRatio,
    };
  }, {
    selector: item.selector,
    minVisibleRatio: MIN_VISIBLE_RATIO,
    minEdgeMargin: MIN_EDGE_MARGIN,
    maxOccludedSampleRatio: MAX_OCCLUDED_SAMPLE_RATIO,
  });
}

const browser = await chromium.launch();
const failures = [];

for (const viewport of VIEWPORTS) {
  for (const item of PAGES) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    const url = `file://${path.join(deploy, item.file)}`;
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.locator('#card-ccsi').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const result = await auditFace(page, item);
    const line = [
      `${item.name}`,
      viewport.name,
      `visible=${result.visibleRatio.toFixed(3)}`,
      `edge=${result.edgeMargin.toFixed(1)}px`,
      `badgeOverlap=${result.badgeOverlapRatio.toFixed(3)}`,
      `occluded=${result.occludedSampleRatio.toFixed(3)}`,
      `object-position=${result.objectPosition}`,
    ].join(' · ');
    if (result.pass) {
      console.log(`✓ ${line}`);
    } else {
      console.error(`✗ ${line}`);
      if (result.blockers.length) console.error(`  blockers: ${JSON.stringify(result.blockers)}`);
      failures.push({ item: item.name, viewport: viewport.name, result });
    }
    await page.close();
  }
}

await browser.close();

if (failures.length) {
  console.error(`\n${failures.length} face-visibility check(s) failed.`);
  process.exit(1);
}

console.log('\n✓ Hub face visibility passes on desktop and mobile.');
