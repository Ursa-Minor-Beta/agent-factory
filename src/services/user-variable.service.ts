import type {
  IUserVariableRepository,
  UserVariableQueryOptions,
} from '../domain/interfaces/repositories/IUserVariableRepository.js';
import type {
  UserVariable,
  CreateUserVariableDTO,
  UpdateUserVariableDTO,
} from '../domain/entities/UserVariable.js';
import { NotFoundError, ForbiddenError, ConflictError, ValidationError } from '../utils/errors.js';

const VARIABLE_NAME_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export class UserVariableService {
  constructor(private userVariableRepo: IUserVariableRepository) {}

  private validateName(name: string): void {
    if (!VARIABLE_NAME_REGEX.test(name)) {
      throw new ValidationError(
        'Variable name must start with a letter or underscore and contain only alphanumeric characters and underscores'
      );
    }
    if (name.length > 100) {
      throw new ValidationError('Variable name must be 100 characters or less');
    }
  }

  async getAll(userId: string, options?: UserVariableQueryOptions): Promise<UserVariable[]> {
    return this.userVariableRepo.findByUserId(userId, options);
  }

  async getById(userId: string, id: string): Promise<UserVariable> {
    const variable = await this.userVariableRepo.findById(id);
    if (!variable) {
      throw new NotFoundError('Variable');
    }
    if (variable.userId !== userId) {
      throw new ForbiddenError('Access denied');
    }
    return variable;
  }

  async create(
    userId: string,
    data: Omit<CreateUserVariableDTO, 'userId'>
  ): Promise<UserVariable> {
    this.validateName(data.name);

    // Check for duplicate within the same workspace scope
    const workspaceIds: (string | null)[] = [data.workspaceId ?? null];
    const existing = await this.userVariableRepo.findByName(userId, data.name, workspaceIds);
    if (existing && existing.workspaceId === (data.workspaceId ?? null)) {
      const scope = data.workspaceId ? 'workspace' : 'global';
      throw new ConflictError(`Variable with name "${data.name}" already exists in ${scope} scope`);
    }

    return this.userVariableRepo.create({ ...data, userId });
  }

  async update(
    userId: string,
    id: string,
    data: UpdateUserVariableDTO
  ): Promise<UserVariable> {
    const existing = await this.userVariableRepo.findById(id);
    if (!existing) {
      throw new NotFoundError('Variable');
    }
    if (existing.userId !== userId) {
      throw new ForbiddenError('Access denied');
    }

    if (data.name !== undefined) {
      this.validateName(data.name);
      if (data.name !== existing.name) {
        // Check for duplicate in the target workspace scope
        const targetWorkspaceId = data.workspaceId !== undefined ? data.workspaceId : existing.workspaceId;
        const workspaceIds: (string | null)[] = [targetWorkspaceId ?? null];
        const duplicate = await this.userVariableRepo.findByName(userId, data.name, workspaceIds);
        if (duplicate && duplicate.id !== id) {
          const scope = targetWorkspaceId ? 'workspace' : 'global';
          throw new ConflictError(`Variable with name "${data.name}" already exists in ${scope} scope`);
        }
      }
    }

    const updated = await this.userVariableRepo.update(id, data);
    return updated!;
  }

  async delete(userId: string, id: string): Promise<void> {
    const existing = await this.userVariableRepo.findById(id);
    if (!existing) {
      throw new NotFoundError('Variable');
    }
    if (existing.userId !== userId) {
      throw new ForbiddenError('Access denied');
    }

    await this.userVariableRepo.delete({ id });
  }

  /**
   * Build a map of variable names to values for interpolation.
   * Used by RunService before workflow execution.
   * @param workspaceId - If provided, includes workspace-scoped variables (which take precedence)
   */
  async buildVariablesMap(userId: string, workspaceId?: string): Promise<Record<string, string>> {
    const variables = await this.userVariableRepo.findAvailableForAgent(userId, workspaceId);
    const map: Record<string, string> = {};
    for (const variable of variables) {
      map[variable.name] = variable.value;
    }
    return map;
  }
}
