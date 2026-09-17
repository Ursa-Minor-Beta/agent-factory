import type { WorkflowNode } from '../../domain/entities/Agent.js';
import type { ExecutionContext } from '../context.js';
import { BaseNode, type NodeExecutionResult, type ExecutionOptions } from './base.js';
import { interpolateAll } from './utils.js';
import {
  extractFiles,
  replaceFileRefsInObject,
  type ExtractedFile,
} from '../../utils/file-extractor.js';

interface OutputNodeData {
  name?: string;
  value?: string; // Template like "{{node:llm-1.response}}"
}

/**
 * Output node - Collects final workflow results
 * Use data.value with {{node:id.path}} template to specify output source
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
    const data = node.data as OutputNodeData;

    let value: unknown;

    if (data.value) {
      // Interpolate the value template
      const interpolated = interpolateAll(data.value, { context });

      // Try to parse as JSON if it looks like JSON
      try {
        value = JSON.parse(interpolated);
      } catch {
        value = interpolated;
      }
    } else {
      // Fallback: use workflow input
      value = options.workflowInput;
    }

    // Extract and save files if the output contains base64 data
    // This is lazy file storage - only save files that are actually referenced in output
    if (options.fileRepo && options.userId && value && typeof value === 'object') {
      const { cleanedOutput, files } = extractFiles(value);

      if (files.length > 0) {
        // Save files to DB
        const savedFiles = await this.saveFiles(files, options.userId, options.fileRepo);

        // Replace placeholders with actual file refs
        const fileIdMap = new Map<number, { id: string; field: string }>();
        files.forEach((f, idx) => {
          const ref = savedFiles[idx];
          if (ref) {
            const parts = ref.split(':');
            fileIdMap.set(idx, { id: parts[1] ?? '', field: f.field });
          }
        });
        value = replaceFileRefsInObject(cleanedOutput, fileIdMap);
      }
    }

    const outputs = { value };

    // Store in context
    context.setOutput(node.id, 'value', value);

    return { outputs };
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
