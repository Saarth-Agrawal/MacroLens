export type CropRegion = { left: number; top: number; width: number; height: number };

export type OcrLineBox = {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  rowHeight?: number;
};

export type HeadlineCandidate = {
  id: string;
  textHint: string;
  region: CropRegion;
  lineRegions: CropRegion[];
  selectionConfidence: number;
  score: number;
  lineCount: number;
};

export type HeadlineValidation = {
  plausible: boolean;
  reasons: string[];
  warning: string;
};

export const bodyTextWarning = "This appears to contain article body text rather than one headline. Select a smaller headline region before analysis.";

const clamp = (value: number, minimum = 0, maximum = 100) => Math.min(maximum, Math.max(minimum, value));

export function cleanOcrText(value: string) {
  return value
    .replace(/[|_]+/g, " ")
    .replace(/[•·]+/g, " ")
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s.,:;\-–—'"“”]+|[\s,:;\-–—'"“”]+$/g, "")
    .trim();
}

export function chooseVisualConfusableAlternative(primary: string, alternative: string, primaryConfidence: number, alternativeConfidence: number) {
  const normal = cleanOcrText(primary);
  const constrained = cleanOcrText(alternative);
  const anusvaraCount = (normal.match(/ं/g) || []).length;
  const onlyRemovesOneMark = anusvaraCount === 1 && cleanOcrText(normal.replace("ं", "")) === constrained;
  // Prefer the constrained visual pass only when the ordinary read is itself
  // uncertain and the alternative remains readable. High-confidence genuine
  // anusvaras are preserved.
  if (onlyRemovesOneMark && primaryConfidence < 82 && alternativeConfidence >= 40 && primaryConfidence - alternativeConfidence <= 32) return constrained;
  return normal;
}

function letterCount(value: string) {
  return (value.match(/\p{L}/gu) || []).length;
}

function wordCount(value: string) {
  return cleanOcrText(value).split(/\s+/).filter(Boolean).length;
}

function languageConsistency(value: string, language: "English" | "Hindi" | "Marathi") {
  const letters = letterCount(value);
  if (!letters) return 0;
  const matching = language === "English"
    ? (value.match(/[A-Za-z]/g) || []).length
    : (value.match(/[\u0900-\u097f]/gu) || []).length;
  return matching / letters;
}

function median(values: number[]) {
  if (!values.length) return 1;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function overlapRatio(left: OcrLineBox, right: OcrLineBox) {
  const overlap = Math.max(0, Math.min(left.bbox.x1, right.bbox.x1) - Math.max(left.bbox.x0, right.bbox.x0));
  const narrower = Math.max(1, Math.min(left.bbox.x1 - left.bbox.x0, right.bbox.x1 - right.bbox.x0));
  return overlap / narrower;
}

function unionBounds(lines: OcrLineBox[]) {
  return {
    x0: Math.min(...lines.map((line) => line.bbox.x0)),
    y0: Math.min(...lines.map((line) => line.bbox.y0)),
    x1: Math.max(...lines.map((line) => line.bbox.x1)),
    y1: Math.max(...lines.map((line) => line.bbox.y1)),
  };
}

function regionIoU(left: CropRegion, right: CropRegion) {
  const x0 = Math.max(left.left, right.left);
  const y0 = Math.max(left.top, right.top);
  const x1 = Math.min(left.left + left.width, right.left + right.width);
  const y1 = Math.min(left.top + left.height, right.top + right.height);
  const intersection = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  const union = left.width * left.height + right.width * right.height - intersection;
  return union ? intersection / union : 0;
}

export function buildHeadlineCandidates(lines: OcrLineBox[], imageWidth: number, imageHeight: number, language: "English" | "Hindi" | "Marathi") {
  const usable = lines.map((line) => ({ ...line, text: cleanOcrText(line.text) })).filter((line) => {
    const height = line.bbox.y1 - line.bbox.y0;
    return height >= 7 && letterCount(line.text) >= 2 && wordCount(line.text) <= 22 && languageConsistency(line.text, language) >= 0.48;
  });
  if (!usable.length) return [] as HeadlineCandidate[];

  const typicalHeight = Math.max(8, median(usable.map((line) => line.bbox.y1 - line.bbox.y0).filter((height) => height > 0)));
  const prominent = usable.filter((line) => {
    const height = line.bbox.y1 - line.bbox.y0;
    const width = line.bbox.x1 - line.bbox.x0;
    return height >= typicalHeight * 1.45 || (height * width) / (imageWidth * imageHeight) >= 0.012;
  }).sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);

  const groups: OcrLineBox[][] = [];
  for (let start = 0; start < prominent.length; start += 1) {
    const group = [prominent[start]];
    for (let index = start + 1; index < prominent.length && group.length < 4; index += 1) {
      const previous = group[group.length - 1];
      const next = prominent[index];
      const previousHeight = previous.bbox.y1 - previous.bbox.y0;
      const nextHeight = next.bbox.y1 - next.bbox.y0;
      const gap = next.bbox.y0 - previous.bbox.y1;
      const leftAlignment = Math.abs(next.bbox.x0 - previous.bbox.x0) / imageWidth;
      const compatible = gap >= -Math.min(previousHeight, nextHeight) * 0.2
        && gap <= Math.max(previousHeight, nextHeight) * 0.82 + 18
        && (overlapRatio(previous, next) >= 0.28 || leftAlignment <= 0.085)
        && Math.min(previousHeight, nextHeight) / Math.max(previousHeight, nextHeight) >= 0.42;
      if (!compatible) {
        if (gap > Math.max(previousHeight, nextHeight) * 1.15) break;
        continue;
      }
      group.push(next);
    }
    groups.push(group);
  }

  const scored = groups.flatMap((group, index) => {
    const bounds = unionBounds(group);
    const width = Math.max(1, bounds.x1 - bounds.x0);
    const height = Math.max(1, bounds.y1 - bounds.y0);
    const text = group.map((line) => line.text).join(" ");
    const words = wordCount(text);
    if (words < 2 || words > 24) return [];
    const averageLineHeight = group.reduce((sum, line) => sum + line.bbox.y1 - line.bbox.y0, 0) / group.length;
    const prominence = Math.min(1, averageLineHeight / (typicalHeight * 3.7));
    const area = Math.min(1, (width * height) / (imageWidth * imageHeight * 0.23));
    const centreX = (bounds.x0 + bounds.x1) / 2 / imageWidth;
    const centreY = (bounds.y0 + bounds.y1) / 2 / imageHeight;
    const centrality = Math.max(0, 1 - Math.abs(centreX - 0.5) * 1.6);
    const upperPosition = Math.max(0, 1 - centreY * 0.82);
    const concise = words <= 14 ? 1 : Math.max(0, 1 - (words - 14) / 10);
    const density = letterCount(text) / Math.max(1, width * height) * 10000;
    const lowParagraphDensity = Math.max(0, 1 - density / 8);
    const confidence = Math.max(0, group.reduce((sum, line) => sum + Math.max(0, line.confidence), 0) / group.length / 100);
    const consistency = languageConsistency(text, language);
    const score = 0.31 * prominence + 0.18 * area + 0.13 * centrality + 0.11 * upperPosition + 0.1 * concise + 0.08 * lowParagraphDensity + 0.05 * confidence + 0.04 * consistency;
    const paddingX = Math.max(imageWidth * 0.018, width * 0.055);
    const paddingY = Math.max(imageHeight * 0.018, averageLineHeight * 0.34);
    const left = clamp((bounds.x0 - paddingX) / imageWidth * 100);
    const top = clamp((bounds.y0 - paddingY) / imageHeight * 100);
    const right = clamp((bounds.x1 + paddingX) / imageWidth * 100);
    const bottom = clamp((bounds.y1 + paddingY) / imageHeight * 100);
    const lineRegions = group.map((line) => {
      // Newspaper OCR can return only the right-hand word of a large line.
      // Extend each reread to the headline group's aligned left edge so a
      // missed leading word is recovered without pulling in adjacent columns.
      const alignedX0 = Math.min(line.bbox.x0, bounds.x0);
      const lineWidth = Math.max(1, line.bbox.x1 - alignedX0);
      const lineHeight = Math.max(1, line.bbox.y1 - line.bbox.y0);
      const linePaddingX = Math.max(imageWidth * 0.006, lineWidth * 0.035);
      const linePaddingTop = Math.max(2, lineHeight * 0.12);
      const linePaddingBottom = Math.max(2, lineHeight * 0.04);
      const lineLeft = clamp((alignedX0 - linePaddingX) / imageWidth * 100);
      const lineTop = clamp((line.bbox.y0 - linePaddingTop) / imageHeight * 100);
      const lineRight = clamp((line.bbox.x1 + linePaddingX) / imageWidth * 100);
      const lineBottom = clamp((line.bbox.y1 + linePaddingBottom) / imageHeight * 100);
      return {
        left: lineLeft,
        top: lineTop,
        width: Math.max(2, lineRight - lineLeft),
        height: Math.max(1.5, lineBottom - lineTop),
      };
    });
    return [{
      id: `candidate-${index + 1}`,
      textHint: text,
      region: { left, top, width: Math.max(4, right - left), height: Math.max(3, bottom - top) },
      lineRegions,
      selectionConfidence: Math.round(clamp(35 + score * 64, 35, 96)),
      score,
      lineCount: group.length,
    } satisfies HeadlineCandidate];
  }).sort((a, b) => b.score - a.score);

  const unique: HeadlineCandidate[] = [];
  for (const candidate of scored) {
    if (unique.some((existing) => regionIoU(existing.region, candidate.region) > 0.58)) continue;
    unique.push({ ...candidate, id: `candidate-${unique.length + 1}` });
    if (unique.length === 3) break;
  }
  return unique;
}

function tokens(value: string) {
  return cleanOcrText(value).split(/\s+/).filter((token) => letterCount(token) > 0);
}

export function mergeLayoutAndDetail(layoutText: string, detailText: string) {
  const primary = tokens(layoutText);
  const secondary = tokens(detailText);
  if (!primary.length) return cleanOcrText(detailText);
  if (!secondary.length) return cleanOcrText(layoutText);

  const table = Array.from({ length: primary.length + 1 }, () => Array(secondary.length + 1).fill(0));
  for (let left = primary.length - 1; left >= 0; left -= 1) {
    for (let right = secondary.length - 1; right >= 0; right -= 1) {
      table[left][right] = primary[left] === secondary[right]
        ? table[left + 1][right + 1] + 1
        : Math.max(table[left + 1][right], table[left][right + 1]);
    }
  }

  const anchors: Array<[number, number]> = [];
  let left = 0;
  let right = 0;
  while (left < primary.length && right < secondary.length) {
    if (primary[left] === secondary[right]) {
      anchors.push([left, right]);
      left += 1;
      right += 1;
    } else if (table[left + 1][right] >= table[left][right + 1]) left += 1;
    else right += 1;
  }

  const output: string[] = [];
  let primaryStart = 0;
  let secondaryStart = 0;
  for (const [primaryAnchor, secondaryAnchor] of [...anchors, [primary.length, secondary.length] as [number, number]]) {
    const primaryGap = primary.slice(primaryStart, primaryAnchor);
    const secondaryGap = secondary.slice(secondaryStart, secondaryAnchor);
    if (!primaryGap.length) output.push(...secondaryGap);
    else if (!secondaryGap.length || primaryGap.length <= secondaryGap.length) output.push(...primaryGap);
    else output.push(...secondaryGap);
    if (primaryAnchor < primary.length) output.push(primary[primaryAnchor]);
    primaryStart = primaryAnchor + 1;
    secondaryStart = secondaryAnchor + 1;
  }

  return cleanOcrText(output.join(" "));
}

export function validateHeadline(value: string, selectionConfidence = 100, allowLowSelectionConfirmation = false): HeadlineValidation {
  const text = value.trim();
  const reasons: string[] = [];
  const words = wordCount(text);
  const sentenceMarks = (text.match(/[.!?।]/g) || []).length;
  const paragraphCount = text.split(/\n\s*\n/).filter((paragraph) => paragraph.trim()).length;
  // Devanagari vowel signs and viramas are Unicode marks (\p{M}), not letters.
  // Treating them as noise caused valid Hindi and Marathi headlines to fail the gate.
  const nonHeadlineCharacters = (text.match(/[^\p{L}\p{M}\p{N}\s.,:;!?%₹$€£'’“”()\-–—।]/gu) || []).length;
  const noiseRatio = nonHeadlineCharacters / Math.max(1, text.length);

  if (text.length > 180) reasons.push("longer than 180 characters");
  if (words > 28) reasons.push("too many words for one headline");
  if (sentenceMarks > 2) reasons.push("contains several sentences");
  if (paragraphCount > 1) reasons.push("contains multiple paragraphs");
  if (noiseRatio > 0.12) reasons.push("contains excessive OCR noise");
  if (words < 2 || letterCount(text) < 5) reasons.push("too little readable headline text");
  if (selectionConfidence < 52 && !allowLowSelectionConfirmation) reasons.push("headline-selection confidence is unusually low");

  return { plausible: reasons.length === 0, reasons, warning: reasons.length ? bodyTextWarning : "" };
}
