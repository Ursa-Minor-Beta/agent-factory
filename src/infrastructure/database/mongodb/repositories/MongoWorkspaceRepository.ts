import { WorkspaceModel, type WorkspaceDocument } from '../models/WorkspaceModel.js';
import { AgentModel } from '../models/AgentModel.js';
import type { IWorkspaceRepository } from '../../../../domain/interfaces/repositories/IWorkspaceRepository.js';
import type {
  Workspace,
  CreateWorkspaceDTO,
  UpdateWorkspaceDTO,
  WorkspaceQueryOptions,
  WorkspaceListResult,
} from '../../../../domain/entities/Workspace.js';

export class MongoWorkspaceRepository implements IWorkspaceRepository {
  private toEntity(doc: WorkspaceDocument): Workspace {
    return {
      id: doc._id.toString(),
      userId: doc.userId.toString(),
      name: doc.name,
      description: doc.description,
      defaultName: doc.defaultName,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  async findById(id: string): Promise<Workspace | null> {
    const doc = await WorkspaceModel.findById(id);
    return doc ? this.toEntity(doc) : null;
  }

  async findByUserId(
    userId: string,
    options: WorkspaceQueryOptions = {}
  ): Promise<WorkspaceListResult> {
    const query: Record<string, unknown> = { userId };

    // Filters
    if (options.name) {
      query.name = { $regex: options.name, $options: 'i' };
    }

    // Sorting
    const sortField = options.sortBy ?? 'updatedAt';
    const sortOrder = options.sortOrder === 'asc' ? 1 : -1;
    const sort: Record<string, 1 | -1> = { [sortField]: sortOrder };

    // Count total before pagination
    const total = await WorkspaceModel.countDocuments(query);

    // Pagination
    const skip = options.skip ?? 0;
    const limit = options.limit ?? 50;

    const docs = await WorkspaceModel.find(query).sort(sort).skip(skip).limit(limit);

    return {
      workspaces: docs.map((doc) => this.toEntity(doc)),
      total,
      skip,
      limit,
    };
  }

  async findByDefaultName(defaultName: string): Promise<Workspace | null> {
    const doc = await WorkspaceModel.findOne({ defaultName });
    return doc ? this.toEntity(doc) : null;
  }

  async create(data: CreateWorkspaceDTO): Promise<Workspace> {
    const doc = await WorkspaceModel.create({
      userId: data.userId,
      name: data.name,
      description: data.description,
      defaultName: data.defaultName,
    });
    return this.toEntity(doc);
  }

  async update(id: string, data: UpdateWorkspaceDTO): Promise<Workspace | null> {
    const doc = await WorkspaceModel.findByIdAndUpdate(id, { $set: data }, { new: true });
    return doc ? this.toEntity(doc) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await WorkspaceModel.findByIdAndDelete(id);
    return result !== null;
  }

  async count(): Promise<number> {
    return WorkspaceModel.countDocuments();
  }

  async countAgentsInWorkspace(workspaceId: string): Promise<number> {
    return AgentModel.countDocuments({ workspaceId });
  }
}
