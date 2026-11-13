import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { Plus, Pencil, ToggleRight, Lock, Trash2 } from 'lucide-react'

interface StaffMember {
  id: string
  name: string
  email: string
  roleId: string
  roleName: string
  active: boolean
  passwordMustChange: boolean
  createdAt: string
}

interface StaffRole {
  id: string
  name: string
  description: string | null
}

type ModalMode = 'create' | 'edit' | 'reset-password' | 'delete' | null

interface FormData {
  name: string
  email: string
  password: string
  roleId: string
}

const EMPTY_FORM: FormData = { name: '', email: '', password: '', roleId: '' }

export function StaffPage() {
  const accessToken = useAuthStore((state) => state.accessToken)
  const currentUserId = useAuthStore((state) => state.user?.id)
  const queryClient = useQueryClient()

  const [modal, setModal] = useState<ModalMode>(null)
  const [selected, setSelected] = useState<StaffMember | null>(null)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)

  const { data: staff = [], isLoading } = useQuery({
    queryKey: ['staff'],
    queryFn: () => api.get<StaffMember[]>('/staff', accessToken ?? undefined),
  })

  const { data: roles = [] } = useQuery({
    queryKey: ['staff-roles'],
    queryFn: () => api.get<StaffRole[]>('/staff/roles', accessToken ?? undefined),
  })

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['staff'] })

  const createMutation = useMutation({
    mutationFn: (body: unknown) => api.post('/staff', body, accessToken ?? undefined),
    onSuccess: () => { invalidate(); closeModal() },
    onError: (e: Error) => setError(e.message),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: unknown }) =>
      api.put(`/staff/${id}`, body, accessToken ?? undefined),
    onSuccess: () => { invalidate(); closeModal() },
    onError: (e: Error) => setError(e.message),
  })

  const toggleMutation = useMutation({
    mutationFn: (id: string) =>
      api.patch(`/staff/${id}/toggle-active`, {}, accessToken ?? undefined),
    onSuccess: invalidate,
  })

  const resetPasswordMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      api.post(`/staff/${id}/reset-password`, { password }, accessToken ?? undefined),
    onSuccess: () => { invalidate(); closeModal() },
    onError: (e: Error) => setError(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/staff/${id}`, accessToken ?? undefined),
    onSuccess: () => { invalidate(); closeModal() },
    onError: (e: Error) => setError(e.message),
  })

  function openCreate() {
    setForm({ ...EMPTY_FORM, roleId: roles[0]?.id ?? '' })
    setError(null)
    setModal('create')
  }

  function openEdit(member: StaffMember) {
    setSelected(member)
    setForm({ name: member.name, email: member.email, password: '', roleId: member.roleId })
    setError(null)
    setModal('edit')
  }

  function openResetPassword(member: StaffMember) {
    setSelected(member)
    setForm({ ...EMPTY_FORM, name: member.name })
    setError(null)
    setModal('reset-password')
  }

  function openDelete(member: StaffMember) {
    setSelected(member)
    setError(null)
    setModal('delete')
  }

  function closeModal() {
    setModal(null)
    setSelected(null)
    setForm(EMPTY_FORM)
    setError(null)
  }

  function handleSubmit() {
    if (modal === 'create') {
      createMutation.mutate({
        name: form.name,
        email: form.email,
        password: form.password,
        roleId: form.roleId,
      })
    } else if (modal === 'edit' && selected) {
      updateMutation.mutate({
        id: selected.id,
        body: {
          ...(form.name !== selected.name && { name: form.name }),
          ...(form.email !== selected.email && { email: form.email }),
          ...(form.roleId !== selected.roleId && { roleId: form.roleId }),
        },
      })
    } else if (modal === 'reset-password' && selected) {
      resetPasswordMutation.mutate({ id: selected.id, password: form.password })
    } else if (modal === 'delete' && selected) {
      deleteMutation.mutate(selected.id)
    }
  }

  const isPending =
    createMutation.isPending ||
    updateMutation.isPending ||
    resetPasswordMutation.isPending ||
    deleteMutation.isPending

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Funcionários</h1>
          <p className="text-sm text-gray-500 mt-0.5">{staff.length} cadastrado{staff.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 transition-colors active:scale-95"
        >
          <Plus className="h-4 w-4" />
          Novo funcionário
        </button>
      </div>

      {isLoading && (
        <div className="grid gap-3">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="bg-white rounded-xl shadow-sm p-4 flex items-center gap-4">
              <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-3">
        {staff.map((member) => (
          <div key={member.id} className="bg-white rounded-xl shadow-sm p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-brand-100 text-brand-700 font-bold text-sm flex items-center justify-center flex-shrink-0">
              {member.name.charAt(0).toUpperCase()}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-gray-900 truncate">{member.name}</span>
                <span className="text-xs px-2 py-0.5 bg-brand-100 text-brand-700 rounded-full font-medium">
                  {member.roleName}
                </span>
                {!member.active && (
                  <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">Inativo</span>
                )}
                {member.passwordMustChange && (
                  <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full">
                    Trocar senha
                  </span>
                )}
                {member.id === currentUserId && (
                  <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">Você</span>
                )}
              </div>
              <p className="text-sm text-gray-400 truncate">{member.email}</p>
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={() => openEdit(member)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Pencil className="h-4 w-4" />
                Editar
              </button>
              {member.id !== currentUserId && (
                <>
                  <button
                    onClick={() => toggleMutation.mutate(member.id)}
                    disabled={toggleMutation.isPending}
                    className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors ${
                      member.active
                        ? 'text-orange-600 border-orange-200 hover:bg-orange-50'
                        : 'text-green-600 border-green-200 hover:bg-green-50'
                    }`}
                  >
                    <ToggleRight className="h-4 w-4" />
                    {member.active ? 'Desativar' : 'Ativar'}
                  </button>
                  <button
                    onClick={() => openResetPassword(member)}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
                  >
                    <Lock className="h-4 w-4" />
                    Senha
                  </button>
                  <button
                    onClick={() => openDelete(member)}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                    Excluir
                  </button>
                </>
              )}
            </div>
          </div>
        ))}

        {!isLoading && staff.length === 0 && (
          <p className="text-gray-400 text-center py-12">Nenhum funcionário cadastrado</p>
        )}
      </div>

      <Modal
        open={modal !== null}
        onClose={closeModal}
        title={
          modal === 'create'
            ? 'Novo funcionário'
            : modal === 'edit'
            ? `Editar · ${selected?.name}`
            : modal === 'reset-password'
            ? `Redefinir senha · ${selected?.name}`
            : modal === 'delete'
            ? 'Confirmar exclusão'
            : undefined
        }
      >
            <div className="p-5 space-y-4">
              {modal === 'delete' ? (
                <p className="text-sm text-gray-600">
                  Tem certeza que deseja excluir <strong>{selected?.name}</strong>? Esta ação não pode ser desfeita.
                </p>
              ) : modal === 'reset-password' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nova senha</label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">O funcionário terá que trocar a senha no próximo login.</p>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="Nome completo"
                      className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                      placeholder="email@exemplo.com"
                      className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  {modal === 'create' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Senha temporária</label>
                      <input
                        type="password"
                        value={form.password}
                        onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                        placeholder="Mínimo 6 caracteres"
                        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Cargo</label>
                    <Select
                      value={form.roleId}
                      onChange={(value) => setForm((prev) => ({ ...prev, roleId: value }))}
                      options={[
                        { value: '', label: 'Selecionar cargo...' },
                        ...roles.map((role) => ({
                          value: role.id,
                          label: role.description ? `${role.name} — ${role.description}` : role.name,
                        })),
                      ]}
                      searchable={roles.length > 6}
                    />
                  </div>
                </>
              )}

              {error && (
                <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{error}</p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  onClick={closeModal}
                  className="flex-1 py-2.5 border border-gray-300 text-sm font-medium text-gray-700 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isPending}
                  className={`flex-1 py-2.5 text-sm font-semibold rounded-xl transition-colors disabled:opacity-50 active:scale-[0.98] ${
                    modal === 'delete'
                      ? 'bg-red-600 text-white hover:bg-red-700'
                      : 'bg-brand-600 text-white hover:bg-brand-700'
                  }`}
                >
                  {isPending
                    ? 'Aguarde...'
                    : modal === 'delete'
                    ? 'Excluir'
                    : modal === 'reset-password'
                    ? 'Redefinir senha'
                    : modal === 'edit'
                    ? 'Salvar'
                    : 'Criar funcionário'}
                </button>
              </div>
            </div>
      </Modal>
    </div>
  )
}
