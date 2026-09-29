import type { ExecutionContext, TempFile } from '../context.js';
import { extractAndReplaceTempRefs } from '../../utils/file-extractor.js';

/**
 * Extract files from node output, store in context, and return cleaned output with temp refs
 * This should be called by nodes before returning their result
 */
export function extractAndStoreFiles(
  output: unknown,
  nodeId: string,
  context: ExecutionContext
): {
  cleanedOutput: unknown;
  fileRefs: string[];
} {
  const { cleanedOutput, tempFiles } = extractAndReplaceTempRefs(output, nodeId);

  // Store each file in context
  const fileRefs: string[] = [];
  for (const { ref, file } of tempFiles) {
    const tempFile: TempFile = {
      mimeType: file.mimeType,
      data: file.data,
      field: file.field,
    };
    context.storeTempFile(ref, tempFile);
    fileRefs.push(ref);
  }

  return { cleanedOutput, fileRefs };
}

/**
 * Resolve temp refs ({{temp:nodeId:idx}}) back to base64 data URLs from context
 * Used by nodes that need the actual base64 data (e.g., LLM nodes for vision)
 */
export function resolveTempRefsToBase64(value: string, context: ExecutionContext): string {
  return value.replace(/\{\{temp:([^}]+)\}\}/g, (match) => {
    const tempFile = context.getTempFile(match);
    if (tempFile) {
      // Convert back to data URL format
      return `data:${tempFile.mimeType};base64,${tempFile.data}`;
    }
    return match;
  });
}
