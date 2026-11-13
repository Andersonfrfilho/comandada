export interface CepResult {
  readonly street: string
  readonly neighborhood: string
  readonly city: string
  readonly state: string
}

type ViaCepResponse = {
  cep: string
  logradouro: string
  complemento: string
  bairro: string
  localidade: string
  uf: string
  erro?: string
}

export class ViaCepProvider {
  async lookup(cep: string): Promise<CepResult | null> {
    const clean = cep.replace(/\D/g, '')
    if (clean.length !== 8) return null

    const url = `https://viacep.com.br/ws/${clean}/json/`
    const response = await fetch(url)
    if (!response.ok) return null

    const data = (await response.json()) as ViaCepResponse
    if (data.erro) return null

    return {
      street: data.logradouro || '',
      neighborhood: data.bairro || '',
      city: data.localidade || '',
      state: data.uf || '',
    }
  }
}
