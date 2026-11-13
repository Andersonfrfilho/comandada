import { eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { UserRepository } from '../../domain/repositories/UserRepository'
import type { UserEntity, UserRole } from '../../domain/entities/User'
import * as schema from '@/infra/database/schema'

type Database = NodePgDatabase<typeof schema>

export class DrizzleUserRepository implements UserRepository {
  constructor(private readonly db: Database) {}

  async findByEmail(email: string): Promise<UserEntity | null> {
    const row = await this.db.query.users.findFirst({
      where: eq(schema.users.email, email),
    })
    return row ?? null
  }

  async findByIdWithRole(id: string): Promise<(UserEntity & { role: UserRole }) | null> {
    const row = await this.db.query.users.findFirst({
      where: eq(schema.users.id, id),
      with: {
        role: {
          with: { permissions: true },
        },
      },
    })

    if (!row) return null

    return {
      ...row,
      role: {
        id: row.role.id,
        name: row.role.name,
        permissions: row.role.permissions.map((p) => ({
          resource: p.resource,
          action: p.action,
        })),
      },
    }
  }

  async updateLastLogin(_id: string): Promise<void> {
    // Last login tracking is handled via audit log entry
  }

  async changePassword(id: string, passwordHash: string): Promise<void> {
    await this.db
      .update(schema.users)
      .set({ passwordHash, passwordMustChange: false, updatedAt: new Date() })
      .where(eq(schema.users.id, id))
  }
}
