import type {
  IUserSecretRepository,
  UserSecretQueryOptions,
} from '../domain/interfaces/repositories/IUserSecretRepository.js';
import type {
  UserSecret,
  CreateUserSecretDTO,
  UpdateUserSecretDTO,
} from '../domain/entities/UserSecret.js';
import { NotFoundError, ForbiddenError, ConflictError, ValidationError } from '../utils/errors.js';

const SECRET_NAME_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export class UserSecretService {
  constructor(private userSecretRepo: IUserSecretRepository) {}

  private validateName(name: string): void {
    if (!SECRET_NAME_REGEX.test(name)) {
      throw new ValidationError(
        'Secret name must start with a letter or underscore and contain only alphanumeric characters and underscores'
      );
    }
    if (name.length > 100) {
      throw new ValidationError('Secret name must be 100 characters or less');
    }
  }

  async getAll(userId: string, options?: UserSecretQueryOptions): Promise<UserSecret[]> {
    return this.userSecretRepo.findByUserId(userId, options);
  }

  async getById(userId: string, id: string): Promise<UserSecret> {
    const secret = await this.userSecretRepo.findById(id);
    if (!secret) {
      throw new NotFoundError('Secret');
    }
    if (secret.userId !== userId) {
      throw new ForbiddenError('Access denied');
    }
    return secret;
  }

  async create(
    userId: string,
    data: Omit<CreateUserSecretDTO, 'userId'>
  ): Promise<UserSecret> {
    this.validateName(data.name);

    // Check for duplicate within the same workspace scope
    const workspaceIds: (string | null)[] = [data.workspaceId ?? null];
    const existing = await this.userSecretRepo.findByName(userId, data.name, workspaceIds);
    if (existing && existing.workspaceId === (data.workspaceId ?? null)) {
      const scope = data.workspaceId ? 'workspace' : 'global';
      throw new ConflictError(`Secret with name "${data.name}" already exists in ${scope} scope`);
    }

    return this.userSecretRepo.create({ ...data, userId });
  }

  async update(
    userId: string,
    id: string,
    data: UpdateUserSecretDTO
  ): Promise<UserSecret> {
    const existing = await this.userSecretRepo.findById(id);
    if (!existing) {
      throw new NotFoundError('Secret');
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
        const duplicate = await this.userSecretRepo.findByName(userId, data.name, workspaceIds);
        if (duplicate && duplicate.id !== id) {
          const scope = targetWorkspaceId ? 'workspace' : 'global';
          throw new ConflictError(`Secret with name "${data.name}" already exists in ${scope} scope`);
        }
      }
    }

    const updated = await this.userSecretRepo.update(id, data);
    return updated!;
  }

  async delete(userId: string, id: string): Promise<void> {
    const existing = await this.userSecretRepo.findById(id);
    if (!existing) {
      throw new NotFoundError('Secret');
    }
    if (existing.userId !== userId) {
      throw new ForbiddenError('Access denied');
    }

    await this.userSecretRepo.delete(id);
  }

  /**
   * Build a map of secret names to values for interpolation.
   * Used by RunService before workflow execution.
   * @param workspaceId - If provided, includes workspace-scoped secrets (which take precedence)
   */
  async buildSecretsMap(userId: string, workspaceId?: string): Promise<Record<string, string>> {
    const secrets = await this.userSecretRepo.findAvailableForAgent(userId, workspaceId);
    const map: Record<string, string> = {};
    for (const secret of secrets) {
      map[secret.name] = secret.value;
    }
    return map;
  }
}
