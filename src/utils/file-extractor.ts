export interface ExtractedFile {
  mimeType: string;
  data: string;
  field: string;
}

export interface TextExtractionResult {
  cleanedText: string;
  files: ExtractedFile[];
}

export interface ExtractedImage {
  mimeType: string;
  data: string; // raw base64 without data URL prefix
}

/**
 * Extract base64 images from a text string for vision API usage
 * Returns the text with images removed and an array of extracted images
 */
export function extractImagesFromText(text: string): {
  text: string;
  images: ExtractedImage[];
} {
  const images: ExtractedImage[] = [];

  // Match data URL format: data:image/type;base64,<data>
  const dataUrlRegex = /data:(image\/[^;]+);base64,([A-Za-z0-9+/=]+)/g;

  // Extract all data URLs and replace with placeholder
  const cleanedText = text.replace(dataUrlRegex, (match, mimeType, data) => {
    images.push({ mimeType, data });
    return ''; // Remove from text
  });

  // Also check for standalone base64 that looks like an image (min 1000 chars)
  // Only if no data URLs were found
  if (images.length === 0) {
    const standaloneRegex = /([A-Za-z0-9+/=]{1000,})/g;
    let match;
    const standaloneImages: { start: number; end: number; image: ExtractedImage }[] = [];

    while ((match = standaloneRegex.exec(text)) !== null) {
      const base64 = match[1];
      if (!base64) continue;
      const mimeType = detectMimeTypeFromBase64(base64);
      // Only extract if it's actually an image
      if (mimeType && mimeType.startsWith('image/')) {
        standaloneImages.push({
          start: match.index,
          end: match.index + match[0].length,
          image: { mimeType, data: base64 },
        });
      }
    }

    // Replace from end to start to preserve indices
    let result = text;
    for (let i = standaloneImages.length - 1; i >= 0; i--) {
      const { start, end, image } = standaloneImages[i]!;
      images.unshift(image); // Add to front to maintain order
      result = result.slice(0, start) + result.slice(end);
    }

    return { text: result.trim(), images };
  }

  return { text: cleanedText.trim(), images };
}

export interface ExtractionResult {
  cleanedOutput: Record<string, unknown>;
  files: ExtractedFile[];
}

/**
 * Extract base64 files from an object, replacing them with placeholders
 * Handles circular references by tracking seen objects
 */
export function extractFilesFromObject(
  obj: Record<string, unknown>,
  files: ExtractedFile[] = [],
  parentKey?: string,
  seen: WeakSet<object> = new WeakSet()
): Record<string, unknown> {
  // Check for circular reference
  if (seen.has(obj)) {
    return '[Circular]' as unknown as Record<string, unknown>;
  }
  seen.add(obj);

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const fieldName = parentKey ? `${parentKey}.${key}` : key;

    if (typeof value === 'string') {
      const extracted = extractBase64FromString(value, fieldName);
      if (extracted) {
        files.push(extracted);
        result[key] = `[file:${files.length - 1}:${extracted.mimeType}]`;
      } else {
        result[key] = value;
      }
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = extractFilesFromObject(value as Record<string, unknown>, files, fieldName, seen);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item, idx) => {
        if (typeof item === 'string') {
          const extracted = extractBase64FromString(item, `${fieldName}[${idx}]`);
          if (extracted) {
            files.push(extracted);
            return `[file:${files.length - 1}:${extracted.mimeType}]`;
          }
          return item;
        } else if (item && typeof item === 'object') {
          if (seen.has(item)) {
            return '[Circular]';
          }
          return extractFilesFromObject(item as Record<string, unknown>, files, `${fieldName}[${idx}]`, seen);
        }
        return item;
      });
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Extract base64 data from a string value
 */
export function extractBase64FromString(value: string, field: string): ExtractedFile | null {
  // Check for data URL format: data:mime/type;base64,<data>
  const dataUrlMatch = value.match(/^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/);
  if (dataUrlMatch && dataUrlMatch[1] && dataUrlMatch[2]) {
    return { mimeType: dataUrlMatch[1], data: dataUrlMatch[2], field };
  }

  // Check for standalone base64 (min 500 chars to avoid false positives)
  if (/^[A-Za-z0-9+/=]{500,}$/.test(value)) {
    const mimeType = detectMimeTypeFromBase64(value) ?? 'application/octet-stream';
    return { mimeType, data: value, field };
  }

  return null;
}

/**
 * Extract base64 data embedded within a text string
 * Returns the text with base64 replaced by placeholders and the extracted files
 */
export function extractBase64FromText(text: string, fieldPrefix = 'embedded'): TextExtractionResult {
  const files: ExtractedFile[] = [];
  let cleanedText = text;

  // Collect all matches first (data URLs and standalone base64)
  const matches: { start: number; end: number; mimeType: string; data: string }[] = [];

  // Match data URL format: data:mime/type;base64,<data>
  const dataUrlRegex = /data:([^;]+);base64,([A-Za-z0-9+/=]{500,})/g;
  let match;

  while ((match = dataUrlRegex.exec(text)) !== null) {
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      mimeType: match[1] ?? 'application/octet-stream',
      data: match[2] ?? '',
    });
  }

  // If no data URLs found, check for standalone base64 strings
  if (matches.length === 0) {
    const standaloneRegex = /([A-Za-z0-9+/=]{500,})/g;

    while ((match = standaloneRegex.exec(text)) !== null) {
      const base64 = match[1];
      if (!base64) continue;
      const mimeType = detectMimeTypeFromBase64(base64);
      if (mimeType) {
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          mimeType,
          data: base64,
        });
      }
    }
  }

  // Process matches from end to start to preserve string indices
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i]!;
    const field = `${fieldPrefix}[${i}]`;
    const placeholder = `[file:${i}:${m.mimeType}]`;
    cleanedText = cleanedText.slice(0, m.start) + placeholder + cleanedText.slice(m.end);
  }

  // Build files array in correct order (0, 1, 2, ...)
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]!;
    files.push({
      mimeType: m.mimeType,
      data: m.data,
      field: `${fieldPrefix}[${i}]`,
    });
  }

  return { cleanedText, files };
}

/**
 * Detect MIME type from base64 data using magic bytes
 */
export function detectMimeTypeFromBase64(base64: string): string | null {
  try {
    // Decode first few bytes to detect magic numbers
    const decoded = Buffer.from(base64.slice(0, 16), 'base64');
    const hex = decoded.toString('hex').toUpperCase();

    // Check common magic bytes
    if (hex.startsWith('FFD8FF')) return 'image/jpeg';
    if (hex.startsWith('89504E47')) return 'image/png';
    if (hex.startsWith('47494638')) return 'image/gif';
    if (hex.startsWith('52494646') && hex.slice(16, 24) === '57454250') return 'image/webp';
    if (hex.startsWith('25504446')) return 'application/pdf';
    if (hex.startsWith('504B0304')) return 'application/zip';

    return null;
  } catch {
    return null;
  }
}

/**
 * Extract all files from node output
 */
export function extractFiles(output: unknown): ExtractionResult {
  if (!output || typeof output !== 'object') {
    return { cleanedOutput: output as Record<string, unknown>, files: [] };
  }

  const files: ExtractedFile[] = [];
  const cleanedOutput = extractFilesFromObject(output as Record<string, unknown>, files);

  return { cleanedOutput, files };
}

/**
 * Strip base64 data from object for MongoDB storage
 * Replaces base64 strings with [base64:size:mimeType] placeholders
 * This prevents bloating the run document while preserving metadata
 */
export function stripBase64ForStorage(
  obj: Record<string, unknown>,
  seen: WeakSet<object> = new WeakSet()
): Record<string, unknown> {
  if (seen.has(obj)) {
    return '[Circular]' as unknown as Record<string, unknown>;
  }
  seen.add(obj);

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      const base64Info = extractBase64FromString(value, key);
      if (base64Info) {
        // Replace with placeholder showing size and type
        const sizeKb = Math.round(base64Info.data.length * 0.75 / 1024);
        result[key] = `[base64:${sizeKb}kb:${base64Info.mimeType}]`;
      } else {
        result[key] = value;
      }
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = stripBase64ForStorage(value as Record<string, unknown>, seen);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) => {
        if (typeof item === 'string') {
          const base64Info = extractBase64FromString(item, key);
          if (base64Info) {
            const sizeKb = Math.round(base64Info.data.length * 0.75 / 1024);
            return `[base64:${sizeKb}kb:${base64Info.mimeType}]`;
          }
          return item;
        } else if (item && typeof item === 'object') {
          if (seen.has(item)) {
            return '[Circular]';
          }
          return stripBase64ForStorage(item as Record<string, unknown>, seen);
        }
        return item;
      });
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Replace file placeholders in a string with inner references
 * Converts [file:0:image/png] to {{inner:id}}
 */
export function replaceFileRefsInString(
  text: string,
  fileIdMap: Map<number, { id: string; field: string }>
): string {
  return text.replace(/\[file:(\d+):([^\]]+)\]/g, (match, idxStr) => {
    const idx = parseInt(idxStr, 10);
    const fileInfo = fileIdMap.get(idx);
    if (fileInfo) {
      return `{{inner:${fileInfo.id}}}`;
    }
    return match;
  });
}

/**
 * Replace file placeholders with actual file references
 * Converts [file:0:image/png] to {{inner:id}}
 * Handles circular references by tracking seen objects
 */
export function replaceFileRefsInObject(
  obj: Record<string, unknown>,
  fileIdMap: Map<number, { id: string; field: string }>,
  seen: WeakSet<object> = new WeakSet()
): Record<string, unknown> {
  // Check for circular reference
  if (seen.has(obj)) {
    return '[Circular]' as unknown as Record<string, unknown>;
  }
  seen.add(obj);

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      const match = value.match(/^\[file:(\d+):([^\]]+)\]$/);
      if (match && match[1]) {
        const idx = parseInt(match[1], 10);
        const fileInfo = fileIdMap.get(idx);
        if (fileInfo) {
          result[key] = `{{inner:${fileInfo.id}}}`;
        } else {
          result[key] = value;
        }
      } else {
        result[key] = value;
      }
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = replaceFileRefsInObject(value as Record<string, unknown>, fileIdMap, seen);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) => {
        if (typeof item === 'string') {
          const match = item.match(/^\[file:(\d+):([^\]]+)\]$/);
          if (match && match[1]) {
            const idx = parseInt(match[1], 10);
            const fileInfo = fileIdMap.get(idx);
            if (fileInfo) {
              return `{{inner:${fileInfo.id}}}`;
            }
          }
          return item;
        } else if (item && typeof item === 'object') {
          if (seen.has(item)) {
            return '[Circular]';
          }
          return replaceFileRefsInObject(item as Record<string, unknown>, fileIdMap, seen);
        }
        return item;
      });
    } else {
      result[key] = value;
    }
  }

  return result;
}
