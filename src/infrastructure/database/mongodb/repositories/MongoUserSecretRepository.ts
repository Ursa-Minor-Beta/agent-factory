import { UserSecretModel, UserSecretDocument } from '../models/UserSecretModel.js';
import type { IUserSecretRepository } from '../../../../domain/interfaces/repositories/IUserSecretRepository.js';
import type {
  UserSecret,
  CreateUserSecretDTO,
  UpdateUserSecretDTO,
} from '../../../../domain/entities/UserSecret.js';
import { encrypt, decrypt } from '../../../../utils/crypto.js';

export class MongoUserSecretRepository implements IUserSecretRepository {
  private toEntity(doc: UserSecretDocument): UserSecret {
    return {
      id: doc._id.toString(),
      userId: doc.userId.toString(),
      name: doc.name,
      value: decrypt(doc.encryptedValue),
      description: doc.description,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  async findById(id: string): Promise<UserSecret | null> {
    const doc = await UserSecretModel.findById(id);
    return doc ? this.toEntity(doc) : null;
  }

  async findByUserId(userId: string): Promise<UserSecret[]> {
    const docs = await UserSecretModel.find({ userId });
    return docs.map((doc) => this.toEntity(doc));
  }

  async findByName(userId: string, name: string): Promise<UserSecret | null> {
    const doc = await UserSecretModel.findOne({ userId, name });
    return doc ? this.toEntity(doc) : null;
  }

  async create(data: CreateUserSecretDTO): Promise<UserSecret> {
    const doc = await UserSecretModel.create({
      userId: data.userId,
      name: data.name,
      encryptedValue: encrypt(data.value),
      description: data.description,
    });
    return this.toEntity(doc);
  }

  async update(id: string, data: UpdateUserSecretDTO): Promise<UserSecret | null> {
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.value !== undefined) updateData.encryptedValue = encrypt(data.value);

    const doc = await UserSecretModel.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    );
    return doc ? this.toEntity(doc) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await UserSecretModel.findByIdAndDelete(id);
    return result !== null;
  }
}
