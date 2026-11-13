export interface UserEntity {
  id: string
  establishmentId: string
  roleId: string
  name: string
  email: string
  passwordHash: string
  active: boolean
  passwordMustChange: boolean
  createdAt: Date
  updatedAt: Date
}

export interface UserRole {
  id: string
  name: string
  permissions: Array<{ resource: string; action: string }>
}
