import type { WorkflowNode } from '../../domain/entities/Agent.js';
import type { ExecutionContext } from '../context.js';
import { BaseNode, type NodeExecutionResult, type ExecutionOptions } from './base.js';
import { interpolateAll } from './utils.js';
import {
  extractFiles,
  extractBase64FromText,
  replaceFileRefsInObject,
  replaceFileRefsInString,
  type ExtractedFile,
} from '../../utils/file-extractor.js';

/**
 * Output node - Collects final workflow results
 * Define output fields directly in data: { fieldName: "{{node:id.path}}", ... }
 *
 * Files are only extracted and saved here (lazy storage) when the output
 * contains base64 data. This avoids storing files that aren't actually
 * used in the final output.
 */
export class OutputNode extends BaseNode {
  readonly type = 'output';

  async execute(
    node: WorkflowNode,
    context: ExecutionContext,
    options: ExecutionOptions
  ): Promise<NodeExecutionResult> {
    const data = node.data ?? {};
    const outputs: Record<string, unknown> = {};
    const fileRefs: string[] = [];

    // Process each field in data as an output field
    for (const [key, template] of Object.entries(data)) {
      let value: unknown;

      if (typeof template === 'string') {
        // Interpolate the template
        const interpolated = interpolateAll(template, { context });

        // Try to parse as JSON if it looks like JSON
        try {
          value = JSON.parse(interpolated);
        } catch {
          value = interpolated;
        }
      } else {
        // Non-string values pass through as-is
        value = template;
      }

      // Extract and save files if the value contains base64 data
      if (options.fileRepo && options.userId && value) {
        value = await this.extractAndSaveFiles(value, key, options, fileRefs);
      }

      outputs[key] = value;
      context.setOutput(node.id, key, value);
    }

    return {
      outputs,
      files: fileRefs.length > 0 ? fileRefs : undefined,
    };
  }

  /**
   * Extract base64 files from value and save to DB
   */
  private async extractAndSaveFiles(
    value: unknown,
    fieldName: string,
    options: ExecutionOptions,
    fileRefs: string[]
  ): Promise<unknown> {
    if (!options.fileRepo || !options.userId) return value;

    if (typeof value === 'object' && value !== null) {
      const { cleanedOutput, files } = extractFiles(value);

      if (files.length > 0) {
        const savedFiles = await this.saveFiles(files, options.userId, options.fileRepo);

        const fileIdMap = new Map<number, { id: string; field: string }>();
        files.forEach((f, idx) => {
          const ref = savedFiles[idx];
          if (ref) {
            const parts = ref.split(':');
            const fileId = parts[1] ?? '';
            fileIdMap.set(idx, { id: fileId, field: f.field });
            fileRefs.push(`{{inner:${fileId}}}`);
          }
        });
        return replaceFileRefsInObject(cleanedOutput, fileIdMap);
      }
    } else if (typeof value === 'string') {
      const { cleanedText, files } = extractBase64FromText(value, fieldName);

      if (files.length > 0) {
        const savedFiles = await this.saveFiles(files, options.userId, options.fileRepo);

        const fileIdMap = new Map<number, { id: string; field: string }>();
        files.forEach((f, idx) => {
          const ref = savedFiles[idx];
          if (ref) {
            const parts = ref.split(':');
            const fileId = parts[1] ?? '';
            fileIdMap.set(idx, { id: fileId, field: f.field });
            fileRefs.push(`{{inner:${fileId}}}`);
          }
        });
        return replaceFileRefsInString(cleanedText, fileIdMap);
      }
    }

    return value;
  }

  /**
   * Save extracted files to DB and return file references
   */
  private async saveFiles(
    files: ExtractedFile[],
    userId: string,
    fileRepo: NonNullable<ExecutionOptions['fileRepo']>
  ): Promise<string[]> {
    const savedFiles = await fileRepo.createMany(
      files.map((f) => ({
        userId,
        name: f.field,
        mimeType: f.mimeType,
        data: f.data,
      }))
    );

    return savedFiles.map((f) => `inner:${f.id}:${f.name}`);
  }
}
