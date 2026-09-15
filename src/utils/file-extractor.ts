export interface ExtractedFile {
  mimeType: string;
  data: string;
  field: string;
}

export interface ExtractionResult {
  cleanedOutput: Record<string, unknown>;
  files: ExtractedFile[];
}

/**
 * Extract base64 files from an object, replacing them with placeholders
 */
export function extractFilesFromObject(
  obj: Record<string, unknown>,
  files: ExtractedFile[] = [],
  parentKey?: string
): Record<string, unknown> {
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
      result[key] = extractFilesFromObject(value as Record<string, unknown>, files, fieldName);
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
          return extractFilesFromObject(item as Record<string, unknown>, files, `${fieldName}[${idx}]`);
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
 * Replace file placeholders with actual file references
 * Converts [file:0:image/png] to inner:<fileId>:<fieldName>
 */
export function replaceFileRefsInObject(
  obj: Record<string, unknown>,
  fileIdMap: Map<number, { id: string; field: string }>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      const match = value.match(/^\[file:(\d+):([^\]]+)\]$/);
      if (match && match[1]) {
        const idx = parseInt(match[1], 10);
        const fileInfo = fileIdMap.get(idx);
        if (fileInfo) {
          result[key] = `inner:${fileInfo.id}:${fileInfo.field}`;
        } else {
          result[key] = value;
        }
      } else {
        result[key] = value;
      }
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = replaceFileRefsInObject(value as Record<string, unknown>, fileIdMap);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) => {
        if (typeof item === 'string') {
          const match = item.match(/^\[file:(\d+):([^\]]+)\]$/);
          if (match && match[1]) {
            const idx = parseInt(match[1], 10);
            const fileInfo = fileIdMap.get(idx);
            if (fileInfo) {
              return `inner:${fileInfo.id}:${fileInfo.field}`;
            }
          }
          return item;
        } else if (item && typeof item === 'object') {
          return replaceFileRefsInObject(item as Record<string, unknown>, fileIdMap);
        }
        return item;
      });
    } else {
      result[key] = value;
    }
  }

  return result;
}
