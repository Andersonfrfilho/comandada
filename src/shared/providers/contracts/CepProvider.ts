interface CepProvider {
  lookup(cep: string): Promise<CepResponse | null>;
}
