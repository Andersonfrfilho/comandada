import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { API_URL } from '@/lib/apiEndpoints'


interface PublicInvoice {
  razaoSocial: string | null
  status: string
  model: string
  numeroDocumento: number | null
  serie: string | null
  chaveAcesso: string | null
  totalLiquido: string | null
  qrCodeUrl: string | null
  danfePdfUrl: string | null
  hasXml: boolean
  authorizedAt: string | null
}

function formatChave(chave: string | null): string {
  if (!chave) return '—'
  return chave.replace(/(.{4})/g, '$1 ').trim()
}

function formatMoney(value: string | null): string {
  return Number(value ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' })
}

// Scoped decoration — a fiscal note is a receipt, so we lean into that vernacular: scalloped
// paper edges, a sakura petal mark, and monospace fiscal codes. Sakura pink is the app's brand.
const receiptStyles = `
  .cupom-shell { background: radial-gradient(120% 80% at 50% 0%, #fdf2f8 0%, #fbe9f2 45%, #f7f5f6 100%); }
  .cupom {
    position: relative; background: #fff;
    filter: drop-shadow(0 18px 34px rgba(190, 24, 93, 0.13));
    --sc: 13px;
    -webkit-mask:
      radial-gradient(circle at 50% 0, #0000 var(--sc), #000 calc(var(--sc) + 0.5px)) top / calc(var(--sc) * 2.6) 51% repeat-x,
      radial-gradient(circle at 50% 100%, #0000 var(--sc), #000 calc(var(--sc) + 0.5px)) bottom / calc(var(--sc) * 2.6) 51% repeat-x;
    mask:
      radial-gradient(circle at 50% 0, #0000 var(--sc), #000 calc(var(--sc) + 0.5px)) top / calc(var(--sc) * 2.6) 51% repeat-x,
      radial-gradient(circle at 50% 100%, #0000 var(--sc), #000 calc(var(--sc) + 0.5px)) bottom / calc(var(--sc) * 2.6) 51% repeat-x;
  }
  .cupom-rule { height: 2px; background-image: linear-gradient(90deg, #f0d4e2 60%, transparent 0);
    background-size: 10px 2px; background-repeat: repeat-x; }
  .petal { width: 34px; height: 34px; color: #ec4899; }
  .qr-frame { border: 1px solid #fbe0ec; border-radius: 14px; padding: 12px; background: #fff; line-height: 0; }
  @media (prefers-reduced-motion: no-preference) {
    .cupom { animation: cupom-in 520ms cubic-bezier(.2,.7,.2,1) both; }
    @keyframes cupom-in { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
  }
`

function Petal() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="petal" aria-hidden="true">
      <path d="M12 2c1.6 3.2 4.2 4.8 7.6 5-1.8 2.9-2 6-.6 9.2-3.4-.6-6.3.2-8.9 2.4-1.9-2.9-4.6-4.2-8.1-4 2.1-2.6 2.8-5.6 2-8.9 3.1.7 5.7 0 8-3.7z" opacity="0.9" />
    </svg>
  )
}

export function CustomerInvoicePage() {
  const { token } = useParams<{ token: string }>()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['public-invoice', token],
    queryFn: async (): Promise<PublicInvoice> => {
      const response = await fetch(`${API_URL}/public/fiscal/${token}`)
      if (!response.ok) throw new Error('not found')
      return response.json()
    },
    retry: false,
    enabled: Boolean(token),
  })

  async function handleDownloadXml() {
    const response = await fetch(`${API_URL}/public/fiscal/${token}/xml`)
    if (!response.ok) {
      window.alert('XML indisponível no momento.')
      return
    }
    const payload = (await response.json()) as { xml: string }
    const blob = new Blob([payload.xml], { type: 'application/xml' })
    const objectUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = `nota-${data?.numeroDocumento ?? token}.xml`
    anchor.click()
    URL.revokeObjectURL(objectUrl)
  }

  return (
    <div className="cupom-shell flex min-h-screen items-center justify-center px-4 py-10">
      <style>{receiptStyles}</style>

      <div className="w-full max-w-[380px]">
        <div className="cupom rounded-[20px] bg-white px-7 pb-8 pt-9">
          {isLoading && <p className="py-10 text-center text-sm text-gray-400">Carregando sua nota…</p>}

          {isError && (
            <div className="py-8 text-center">
              <Petal />
              <p className="mt-4 font-semibold text-gray-900">Nota não encontrada</p>
              <p className="mt-1 text-sm text-gray-500">O link pode ter expirado ou ser inválido.</p>
            </div>
          )}

          {data && (
            <>
              <div className="flex flex-col items-center text-center">
                <Petal />
                <h1 className="mt-3 text-lg font-bold tracking-tight text-gray-900">
                  {data.razaoSocial ?? 'Estabelecimento'}
                </h1>
                <p className="mt-1 text-[0.7rem] font-medium uppercase tracking-[0.18em] text-brand-600">
                  Nota Fiscal · {data.model}
                </p>
                <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                  Autorizada
                </span>
              </div>

              <div className="cupom-rule my-6" />

              <div className="text-center">
                <p className="text-[0.65rem] font-medium uppercase tracking-[0.2em] text-gray-400">Valor total</p>
                <p className="mt-1 text-4xl font-bold tracking-tight text-gray-900">
                  <span className="align-top text-lg font-semibold text-gray-400">R$ </span>
                  {formatMoney(data.totalLiquido)}
                </p>
              </div>

              <div className="mt-6 flex justify-between text-sm">
                <div>
                  <p className="text-[0.65rem] uppercase tracking-wider text-gray-400">Número</p>
                  <p className="font-mono font-semibold text-gray-800">{data.numeroDocumento ?? '—'}</p>
                </div>
                <div className="text-right">
                  <p className="text-[0.65rem] uppercase tracking-wider text-gray-400">Série</p>
                  <p className="font-mono font-semibold text-gray-800">{data.serie ?? '—'}</p>
                </div>
              </div>

              <div className="cupom-rule my-6" />

              <div>
                <p className="text-[0.65rem] uppercase tracking-[0.2em] text-gray-400">Chave de acesso</p>
                <p className="mt-1.5 break-all font-mono text-[0.78rem] leading-relaxed text-gray-600">
                  {formatChave(data.chaveAcesso)}
                </p>
              </div>

              {data.qrCodeUrl && (
                <div className="mt-7 flex flex-col items-center gap-2">
                  <div className="qr-frame">
                    <QRCodeSVG value={data.qrCodeUrl} size={132} level="M" fgColor="#1f1620" bgColor="#ffffff" />
                  </div>
                  <a
                    href={data.qrCodeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium text-gray-400 underline decoration-dotted underline-offset-4 hover:text-brand-600"
                  >
                    Consultar na SEFAZ
                  </a>
                </div>
              )}

              <div className="mt-6 flex flex-col gap-2.5">
                {data.danfePdfUrl && (
                  <a
                    href={data.danfePdfUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl bg-brand-600 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                  >
                    Baixar PDF
                  </a>
                )}
                {data.hasXml && (
                  <button
                    type="button"
                    onClick={handleDownloadXml}
                    className="rounded-xl border border-brand-200 py-3 text-center text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                  >
                    Baixar XML
                  </button>
                )}
              </div>

              <p className="mt-7 text-center text-[0.68rem] text-gray-400">
                Autorizada em {formatDate(data.authorizedAt)}
              </p>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-[0.68rem] tracking-wide text-gray-400">
          Documento fiscal eletrônico · guarde este comprovante
        </p>
      </div>
    </div>
  )
}
