import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { Plus, Pencil, Trash2, Shield } from 'lucide-react'

interface RolePermission {
  id: string
  resource: string
  action: string
}

interface RoleItem {
  role: {
    id: string
    name: string
    description: string | null
  }
  permissions: RolePermission[]
}

type ModalMode = 'create' | 'edit' | 'delete' | null

interface FormData {
  name: string
  description: string
}

type PermissionState = Record<string, boolean>

const EMPTY_FORM: FormData = { name: '', description: '' }

const RESOURCES = [
  { key: 'orders', label: 'Pedidos' },
  { key: 'kitchen', label: 'Cozinha' },
  { key: 'cashier', label: 'Caixa' },
  { key: 'delivery', label: 'Entregas' },
  { key: 'users', label: 'Usuários' },
  { key: 'products', label: 'Produtos' },
  { key: 'reports', label: 'Relatórios' },
  { key: 'settings', label: 'Configurações' },
  { key: 'conversations', label: 'Conversas' },
  { key: 'fiscal', label: 'Fiscal' },
] as const

const ACTIONS = [
  { key: 'read', label: 'Ler' },
  { key: 'write', label: 'Escrever' },
  { key: 'delete', label: 'Excluir' },
  { key: 'manage', label: 'Gerenciar' },
] as const

const NON_MANAGE_ACTIONS = ['read', 'write', 'delete'] as const

function buildInitialPermissions(): PermissionState {
  const state: PermissionState = {}
  for (const resource of RESOURCES) {
    for (const action of ACTIONS) {
      state[`${resource.key}:${action.key}`] = false
    }
  }
  return state
}

function applyApiPermissions(base: PermissionState, perms: RolePermission[]): PermissionState {
  const state = { ...base }
  for (const perm of perms) {
    const key = `${perm.resource}:${perm.action}`
    if (key in state) {
      state[key] = true
    }
  }
  for (const resource of RESOURCES) {
    const hasAll = NON_MANAGE_ACTIONS.every(
      (action) => state[`${resource.key}:${action}`]
    )
    if (hasAll) {
      state[`${resource.key}:manage`] = true
    }
  }
  return state
}

function buildPermissionsPayload(state: PermissionState): Array<{ resource: string; action: string }> {
  return Object.entries(state)
    .filter(([, checked]) => checked)
    .map(([key]) => {
      const lastColon = key.lastIndexOf(':')
      return {
        resource: key.slice(0, lastColon),
        action: key.slice(lastColon + 1),
      }
    })
}

export function RolesPage() {
  const accessToken = useAuthStore((state) => state.accessToken)
  const queryClient = useQueryClient()

  const [modal, setModal] = useState<ModalMode>(null)
  const [selected, setSelected] = useState<RoleItem | null>(null)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [permissions, setPermissions] = useState<PermissionState>(buildInitialPermissions())
  const [error, setError] = useState<string | null>(null)

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: () => api.get<RoleItem[]>('/roles', accessToken ?? undefined),
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['roles'] })
  }

  const createMutation = useMutation({
    mutationFn: (body: { name: string; description: string }) =>
      api.post('/roles', body, accessToken ?? undefined),
    onSuccess: () => { invalidate(); closeModal() },
    onError: (e: Error) => setError(e.message),
  })

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      body,
      perms,
    }: {
      id: string
      body: { name: string; description: string }
      perms: Array<{ resource: string; action: string }>
    }) => {
      await api.put(`/roles/${id}`, body, accessToken ?? undefined)
      await api.put(`/roles/${id}/permissions`, { permissions: perms }, accessToken ?? undefined)
    },
    onSuccess: () => { invalidate(); closeModal() },
    onError: (e: Error) => setError(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/roles/${id}`, accessToken ?? undefined),
    onSuccess: () => { invalidate(); closeModal() },
    onError: (e: Error) => setError(e.message),
  })

  function openCreate() {
    setForm(EMPTY_FORM)
    setPermissions(buildInitialPermissions())
    setError(null)
    setModal('create')
  }

  function openEdit(item: RoleItem) {
    setSelected(item)
    setForm({ name: item.role.name, description: item.role.description ?? '' })
    setPermissions(applyApiPermissions(buildInitialPermissions(), item.permissions))
    setError(null)
    setModal('edit')
  }

  function openDelete(item: RoleItem) {
    setSelected(item)
    setError(null)
    setModal('delete')
  }

  function closeModal() {
    setModal(null)
    setSelected(null)
    setForm(EMPTY_FORM)
    setPermissions(buildInitialPermissions())
    setError(null)
  }

  function togglePermission(resource: string, action: string) {
    setPermissions((prev) => {
      const key = `${resource}:${action}`
      const isNowChecked = !prev[key]
      const next = { ...prev, [key]: isNowChecked }

      if (action === 'manage') {
        for (const a of NON_MANAGE_ACTIONS) {
          next[`${resource}:${a}`] = isNowChecked
        }
      } else {
        const allChecked = NON_MANAGE_ACTIONS.every((a) => {
          const k = `${resource}:${a}`
          return k === key ? isNowChecked : (next[k] ?? false)
        })
        next[`${resource}:manage`] = allChecked
      }

      return next
    })
  }

  function handleSubmit() {
    if (modal === 'create') {
      createMutation.mutate({ name: form.name, description: form.description })
    } else if (modal === 'edit' && selected) {
      updateMutation.mutate({
        id: selected.role.id,
        body: { name: form.name, description: form.description },
        perms: buildPermissionsPayload(permissions),
      })
    } else if (modal === 'delete' && selected) {
      deleteMutation.mutate(selected.role.id)
    }
  }

  const isPending =
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Cargos</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {roles.length} cargo{roles.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 transition-colors active:scale-95"
        >
          <Plus className="h-4 w-4" />
          Novo cargo
        </button>
      </div>

      {isLoading && (
        <div className="grid gap-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="bg-white rounded-xl shadow-sm p-4 flex items-center gap-4">
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
        {roles.map((item) => (
          <div key={item.role.id} className="bg-white rounded-xl shadow-sm p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center flex-shrink-0">
              <Shield className="h-5 w-5" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-gray-900 truncate">{item.role.name}</span>
                <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full font-medium">
                  {item.permissions.length} permiss{item.permissions.length !== 1 ? 'ões' : 'ão'}
                </span>
              </div>
              {item.role.description && (
                <p className="text-sm text-gray-400 truncate">{item.role.description}</p>
              )}
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={() => openEdit(item)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Pencil className="h-4 w-4" />
                Editar
              </button>
              <button
                onClick={() => openDelete(item)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                Excluir
              </button>
            </div>
          </div>
        ))}

        {!isLoading && roles.length === 0 && (
          <p className="text-gray-400 text-center py-12">Nenhum cargo cadastrado</p>
        )}
      </div>

      <Modal
        open={modal !== null}
        onClose={closeModal}
        title={
          modal === 'create'
            ? 'Novo cargo'
            : modal === 'edit'
            ? `Editar · ${selected?.role.name}`
            : modal === 'delete'
            ? 'Confirmar exclusão'
            : undefined
        }
        size={modal === 'edit' ? 'xl' : 'md'}
      >
        <div className="p-5 space-y-4">
          {modal === 'delete' ? (
            <p className="text-sm text-gray-600">
              Tem certeza que deseja excluir o cargo <strong>{selected?.role.name}</strong>? Esta ação não pode ser desfeita.
            </p>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Nome do cargo"
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Descrição do cargo"
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              {modal === 'edit' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Permissões</label>
                  <div className="overflow-x-auto border border-gray-200 rounded-xl">
                    <table className="w-full min-w-[500px]">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="text-left text-xs font-medium text-gray-500 px-4 py-2 sticky left-0 bg-gray-50">
                            Recurso
                          </th>
                          {ACTIONS.map((action) => (
                            <th
                              key={action.key}
                              className="text-center text-xs font-medium text-gray-500 px-2 py-2 w-20"
                            >
                              {action.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {RESOURCES.map((resource) => (
                          <tr
                            key={resource.key}
                            className="border-t border-gray-100 hover:bg-gray-50/50"
                          >
                            <td className="px-4 py-2 text-sm font-medium text-gray-700 sticky left-0 bg-white">
                              {resource.label}
                            </td>
                            {ACTIONS.map((action) => (
                              <td key={action.key} className="px-2 py-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={permissions[`${resource.key}:${action.key}`] ?? false}
                                  onChange={() => togglePermission(resource.key, action.key)}
                                  className="w-4 h-4 text-brand-600 border-gray-300 rounded focus:ring-brand-500 cursor-pointer"
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
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
                : modal === 'edit'
                ? 'Salvar'
                : 'Criar cargo'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
