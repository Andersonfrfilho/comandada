class ViaCepProviderImplementation implements CepProvider {
  constructor(private readonly http: HttpClientProvider) {}

  async lookup(cep: string): Promise<CepResponse | null> {
    const digits = cep.replace(/\D/g, '');
    const data = await this.http.request<CepResponse>({
      method: 'GET',
      url: 'https://viacep.com.br/ws/' + digits.substring(0, 5) + '-' + digits.substring(5) + '/json/',
      headers: { 'User-Agent': 'SakuraBot/1.0' },
    });
    return data?.erro ? null : data;
  }
}
