import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'
import { Pencil, Trash2, Plus } from 'lucide-react'

interface Section {
  id: string
  name: string
  description: string | null
}

export function SectionManager() {
  const accessToken = useAuthStore((state) => state.accessToken)
  const queryClient = useQueryClient()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: sections = [] } = useQuery({
    queryKey: ['sections'],
    queryFn: () => api.get<Section[]>('/sections', accessToken ?? undefined),
  })

  const createSection = useMutation({
    mutationFn: (body: unknown) => api.post('/sections', body, accessToken ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sections'] })
      resetForm()
    },
    onError: (e: Error) => setError(e.message),
  })

  const updateSection = useMutation({
    mutationFn: ({ id, body }: { id: string; body: unknown }) =>
      api.put(`/sections/${id}`, body, accessToken ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sections'] })
      resetForm()
    },
    onError: (e: Error) => setError(e.message),
  })

  const deleteSection = useMutation({
    mutationFn: (id: string) => api.delete(`/sections/${id}`, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sections'] }),
    onError: (e: Error) => setError(e.message),
  })

  function resetForm() {
    setEditingId(null)
    setAdding(false)
    setFormName('')
    setFormDescription('')
    setError(null)
  }

  function startEdit(section: Section) {
    setEditingId(section.id)
    setAdding(false)
    setFormName(section.name)
    setFormDescription(section.description ?? '')
    setError(null)
  }

  function startAdd() {
    setAdding(true)
    setEditingId(null)
    setFormName('')
    setFormDescription('')
    setError(null)
  }

  function submit() {
    const body = {
      name: formName,
      description: formDescription || undefined,
    }
    if (editingId) {
      updateSection.mutate({ id: editingId, body })
    } else {
      createSection.mutate(body)
    }
  }

  const isPending = createSection.isPending || updateSection.isPending

  return (
    <div className="border-t border-gray-200 pt-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-700">Seções</h2>
        {!adding && (
          <button
            onClick={startAdd}
            className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
          >
            <Plus className="h-3.5 w-3.5" />
            Adicionar
          </button>
        )}
      </div>

      {sections.length === 0 && !adding && (
        <p className="text-xs text-gray-400 italic">Nenhuma seção cadastrada (ex: corredor, prateleira, freezer)</p>
      )}

      <div className="space-y-2">
        {sections.map((section) =>
          editingId === section.id ? (
            <div key={section.id} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              <div className="flex gap-2 items-end">
                <div className="flex-1 space-y-2">
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Nome da seção"
                    className="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <input
                    type="text"
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="Descrição (opcional)"
                    className="w-full border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    onClick={submit}
                    disabled={isPending}
                    className="px-2 py-1 text-xs font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
                  >
                    Salvar
                  </button>
                  <button
                    onClick={resetForm}
                    className="px-2 py-1 text-xs font-medium text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-100"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
              {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
            </div>
          ) : (
            <div
              key={section.id}
              className="bg-white rounded-lg border border-gray-200 px-3 py-2 flex items-center justify-between group"
            >
              <div className="min-w-0">
                <span className="text-sm font-medium text-gray-800">{section.name}</span>
                {section.description && (
                  <span className="ml-2 text-xs text-gray-400 truncate">{section.description}</span>
                )}
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => startEdit(section)}
                  className="p-1 text-gray-400 hover:text-brand-600"
                  title="Editar"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => deleteSection.mutate(section.id)}
                  className="p-1 text-gray-400 hover:text-red-500"
                  title="Excluir"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )
        )}

        {adding && (
          <div className="bg-gray-50 rounded-lg p-3 border border-brand-200">
            <div className="flex gap-2 items-end">
              <div className="flex-1 space-y-2">
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Nome da seção"
                  className="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <input
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Descrição (opcional)"
                  className="w-full border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button
                  onClick={submit}
                  disabled={isPending}
                  className="px-2 py-1 text-xs font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
                >
                  Criar
                </button>
                <button
                  onClick={resetForm}
                  className="px-2 py-1 text-xs font-medium text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-100"
                >
                  Cancelar
                </button>
              </div>
            </div>
            {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
          </div>
        )}
      </div>
    </div>
  )
}
