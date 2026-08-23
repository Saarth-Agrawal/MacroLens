import type { CropRegion } from "./headlineOcr";

export type PreparedDocument = {
  canvas: HTMLCanvasElement;
  binaryCanvas: HTMLCanvasElement;
  previewUrl: string;
  aspect: number;
  skewDegrees: number;
};

function makeCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function longestRun(values: boolean[], minimumLength: number) {
  let bestStart = -1;
  let bestEnd = -1;
  let start = -1;
  for (let index = 0; index <= values.length; index += 1) {
    if (index < values.length && values[index]) {
      if (start < 0) start = index;
      continue;
    }
    if (start >= 0 && index - start >= minimumLength && index - start > bestEnd - bestStart) {
      bestStart = start;
      bestEnd = index;
    }
    start = -1;
  }
  return bestStart >= 0 ? { start: bestStart, end: bestEnd } : null;
}

function contentBounds(data: ImageData) {
  const { width, height } = data;
  const rowCoverage = Array(height).fill(0);
  const columnCoverage = Array(width).fill(0);
  const isPaper = (offset: number) => {
    const red = data.data[offset];
    const green = data.data[offset + 1];
    const blue = data.data[offset + 2];
    return red < 244 || green < 244 || blue < 244;
  };

  const sampleStep = Math.max(1, Math.floor(Math.max(width, height) / 1000));
  for (let y = 0; y < height; y += sampleStep) {
    let hits = 0;
    let samples = 0;
    for (let x = 0; x < width; x += sampleStep) {
      samples += 1;
      if (isPaper((y * width + x) * 4)) hits += 1;
    }
    rowCoverage[y] = hits / Math.max(1, samples);
  }

  const denseRows = rowCoverage.map((coverage) => coverage > 0.5);
  const denseRun = longestRun(denseRows, Math.max(24, Math.round(height * 0.12)));
  let top = denseRun?.start ?? height;
  let bottom = denseRun?.end ?? 0;

  if (!denseRun) {
    for (let y = 0; y < height; y += sampleStep) {
      if (rowCoverage[y] > 0.025) {
        top = Math.min(top, y);
        bottom = Math.max(bottom, y + sampleStep);
      }
    }
  }
  if (bottom <= top) return { left: 0, top: 0, width, height };

  for (let x = 0; x < width; x += sampleStep) {
    let hits = 0;
    let samples = 0;
    for (let y = top; y < bottom; y += sampleStep) {
      samples += 1;
      if (isPaper((y * width + x) * 4)) hits += 1;
    }
    columnCoverage[x] = hits / Math.max(1, samples);
  }
  const activeColumns = columnCoverage.map((coverage) => coverage > (denseRun ? 0.45 : 0.018));
  const columnRun = longestRun(activeColumns, Math.max(24, Math.round(width * 0.12)));
  const left = columnRun?.start ?? 0;
  const right = columnRun?.end ?? width;
  const paddingX = Math.round((right - left) * 0.006);
  const paddingY = Math.round((bottom - top) * 0.006);
  return {
    left: Math.max(0, left - paddingX),
    top: Math.max(0, top - paddingY),
    width: Math.min(width, right + paddingX) - Math.max(0, left - paddingX),
    height: Math.min(height, bottom + paddingY) - Math.max(0, top - paddingY),
  };
}

function contrastGreyscale(source: HTMLCanvasElement) {
  const context = source.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Image processing canvas unavailable");
  const image = context.getImageData(0, 0, source.width, source.height);
  const histogram = Array(256).fill(0);
  for (let offset = 0; offset < image.data.length; offset += 4) {
    const grey = Math.round(0.299 * image.data[offset] + 0.587 * image.data[offset + 1] + 0.114 * image.data[offset + 2]);
    histogram[grey] += 1;
  }
  const pixels = source.width * source.height;
  const percentile = (target: number) => {
    let count = 0;
    for (let value = 0; value < 256; value += 1) {
      count += histogram[value];
      if (count >= pixels * target) return value;
    }
    return target < 0.5 ? 0 : 255;
  };
  const black = percentile(0.01);
  const white = Math.max(black + 24, percentile(0.99));
  for (let offset = 0; offset < image.data.length; offset += 4) {
    const grey = Math.round(0.299 * image.data[offset] + 0.587 * image.data[offset + 1] + 0.114 * image.data[offset + 2]);
    const adjusted = Math.max(0, Math.min(255, Math.round((grey - black) / (white - black) * 255)));
    image.data[offset] = adjusted;
    image.data[offset + 1] = adjusted;
    image.data[offset + 2] = adjusted;
    image.data[offset + 3] = 255;
  }
  const canvas = makeCanvas(source.width, source.height);
  canvas.getContext("2d", { alpha: false })?.putImageData(image, 0, 0);
  return canvas;
}

function adaptiveThreshold(source: HTMLCanvasElement) {
  const context = source.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Threshold canvas unavailable");
  const image = context.getImageData(0, 0, source.width, source.height);
  const { width, height } = source;
  const integral = new Float64Array((width + 1) * (height + 1));
  for (let y = 1; y <= height; y += 1) {
    let row = 0;
    for (let x = 1; x <= width; x += 1) {
      row += image.data[((y - 1) * width + x - 1) * 4];
      integral[y * (width + 1) + x] = integral[(y - 1) * (width + 1) + x] + row;
    }
  }
  const radius = Math.max(12, Math.round(Math.min(width, height) / 42));
  for (let y = 0; y < height; y += 1) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height - 1, y + radius);
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);
      const sum = integral[(y1 + 1) * (width + 1) + x1 + 1] - integral[y0 * (width + 1) + x1 + 1] - integral[(y1 + 1) * (width + 1) + x0] + integral[y0 * (width + 1) + x0];
      const mean = sum / ((x1 - x0 + 1) * (y1 - y0 + 1));
      const value = image.data[(y * width + x) * 4] < mean - 10 ? 0 : 255;
      const offset = (y * width + x) * 4;
      image.data[offset] = value;
      image.data[offset + 1] = value;
      image.data[offset + 2] = value;
      image.data[offset + 3] = 255;
    }
  }
  const canvas = makeCanvas(width, height);
  canvas.getContext("2d", { alpha: false })?.putImageData(image, 0, 0);
  return canvas;
}

function estimateSkew(binary: HTMLCanvasElement) {
  const context = binary.getContext("2d", { willReadFrequently: true });
  if (!context) return 0;
  const { width, height } = binary;
  const data = context.getImageData(0, 0, width, height).data;
  const step = Math.max(2, Math.floor(width / 850));
  let bestAngle = 0;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let angle = -3; angle <= 3; angle += 0.5) {
    const tangent = Math.tan(angle * Math.PI / 180);
    const rows = new Float64Array(height + Math.round(width * Math.abs(tangent)) + 4);
    const offset = Math.round(width * Math.abs(tangent) / 2) + 2;
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        if (data[(y * width + x) * 4] > 80) continue;
        const projected = Math.round(y + tangent * (x - width / 2)) + offset;
        if (projected >= 0 && projected < rows.length) rows[projected] += 1;
      }
    }
    let score = 0;
    for (let index = 1; index < rows.length; index += 1) {
      const difference = rows[index] - rows[index - 1];
      score += difference * difference;
    }
    if (score > bestScore) {
      bestScore = score;
      bestAngle = angle;
    }
  }
  return Math.abs(bestAngle) < 0.35 ? 0 : bestAngle;
}

function rotateCanvas(source: HTMLCanvasElement, degrees: number) {
  if (!degrees) return source;
  const canvas = makeCanvas(source.width, source.height);
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) return source;
  context.fillStyle = "white";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate(-degrees * Math.PI / 180);
  context.drawImage(source, -source.width / 2, -source.height / 2);
  return canvas;
}

export async function prepareDocumentImage(file: File): Promise<PreparedDocument> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const sourceScale = Math.min(1, 1800 / bitmap.width);
  const source = makeCanvas(bitmap.width * sourceScale, bitmap.height * sourceScale);
  const sourceContext = source.getContext("2d", { alpha: false, willReadFrequently: true });
  if (!sourceContext) throw new Error("Image canvas unavailable");
  sourceContext.fillStyle = "white";
  sourceContext.fillRect(0, 0, source.width, source.height);
  sourceContext.drawImage(bitmap, 0, 0, source.width, source.height);
  bitmap.close();

  const bounds = contentBounds(sourceContext.getImageData(0, 0, source.width, source.height));
  const outputScale = Math.min(2.2, Math.max(1, 1800 / Math.max(1, bounds.width)));
  const trimmed = makeCanvas(bounds.width * outputScale, bounds.height * outputScale);
  const trimmedContext = trimmed.getContext("2d", { alpha: false });
  if (!trimmedContext) throw new Error("Trim canvas unavailable");
  trimmedContext.fillStyle = "white";
  trimmedContext.fillRect(0, 0, trimmed.width, trimmed.height);
  trimmedContext.drawImage(source, bounds.left, bounds.top, bounds.width, bounds.height, 0, 0, trimmed.width, trimmed.height);

  const greyscale = contrastGreyscale(trimmed);
  const firstBinary = adaptiveThreshold(greyscale);
  const skewDegrees = estimateSkew(firstBinary);
  const deskewed = rotateCanvas(greyscale, skewDegrees);
  const binaryCanvas = adaptiveThreshold(deskewed);
  return {
    canvas: deskewed,
    binaryCanvas,
    previewUrl: deskewed.toDataURL("image/jpeg", 0.9),
    aspect: deskewed.width / deskewed.height,
    skewDegrees,
  };
}

export function cropCanvas(source: HTMLCanvasElement, region: CropRegion, targetWidth = 2200) {
  const sourceX = Math.round(source.width * region.left / 100);
  const sourceY = Math.round(source.height * region.top / 100);
  const sourceWidth = Math.max(1, Math.round(source.width * region.width / 100));
  const sourceHeight = Math.max(1, Math.round(source.height * region.height / 100));
  const scale = Math.min(4, Math.max(1, targetWidth / sourceWidth));
  const canvas = makeCanvas(sourceWidth * scale, sourceHeight * scale);
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Crop canvas unavailable");
  context.fillStyle = "white";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
  return canvas;
}
