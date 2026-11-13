# Processos e Regras Operacionais

> Este documento é injetado como contexto da IA a cada conversa.
> Preencha com as informações reais do estabelecimento.
> Mantenha objetivo — a IA usa este texto diretamente.

---

## Identificação

- **Nome**: [NOME DO ESTABELECIMENTO]
- **Tipo**: [restaurante / barbearia / clínica / loja / outro]
- **WhatsApp**: [EX: (11) 9xxxx-xxxx]
- **Instagram / site**: [EX: @estabelecimento]
- **Endereço**: [RUA, Nº — BAIRRO — CIDADE] _(para retirada ou visita presencial)_

---

## Horário de Funcionamento

| Dia | Horário | Observação |
|---|---|---|
| Segunda | [HORÁRIO ou FECHADO] | |
| Terça | [HORÁRIO ou FECHADO] | |
| Quarta | [HORÁRIO ou FECHADO] | |
| Quinta | [HORÁRIO ou FECHADO] | |
| Sexta | [HORÁRIO ou FECHADO] | |
| Sábado | [HORÁRIO ou FECHADO] | |
| Domingo | [HORÁRIO ou FECHADO] | |

- Feriados: [horário reduzido / fechado / normal — divulgado no Instagram]

---

## O Que Oferecemos

> Descreva resumidamente os produtos ou serviços. A IA usa este bloco para responder dúvidas gerais.

[EX: Somos um restaurante de comida japonesa especializado em delivery e retirada no balcão. Também oferecemos mesas para consumo no local com reserva antecipada.]

[EX: Somos uma barbearia com atendimento por agendamento. Oferecemos corte, barba, e combos. Não fazemos delivery — apenas presencial com hora marcada.]

---

## Formas de Pagamento

- [EX: PIX — chave: CNPJ / e-mail / telefone]
- [EX: Cartão de crédito / débito]
- [EX: Dinheiro]
- **Não aceito**: [EX: vale refeição, cheque]

---

## Área de Entrega e Taxas _(preencher se tiver delivery)_

| Bairro / Zona | Taxa de entrega |
|---|---|
| [Bairro 1] | R$ XX,00 |
| [Bairro 2] | R$ XX,00 |

- **Frete grátis**: pedidos acima de R$ [XX],00 _(remover linha se não aplicável)_
- **Pedido mínimo**: R$ [XX],00
- Bairros fora da lista: não atendemos / consultar

---

## Tempo de Atendimento

- **Delivery**: [EX: 45–60 min (pico: até 70 min)]
- **Retirada**: [EX: 20–30 min]
- **Serviço presencial**: [EX: atendimentos de 30 min — chegar 5 min antes]

---

## Política de Cancelamento e Alteração

- **Pedidos**: [EX: cancelamento em até 5 minutos após confirmação]
- **Reservas**: [EX: cancelamento com até 2 horas de antecedência]
- **Agendamentos**: [EX: cancelamento com até 24 horas de antecedência]

---

## Política de Reservas _(preencher se FEATURE_RESERVAS=true)_

- Capacidade total: [EX: 40 pessoas / 10 mesas]
- Reserva mínima de antecedência: [EX: 2 horas]
- Reserva máxima de antecedência: [EX: 30 dias]
- Grupos acima de [EX: 8 pessoas]: [EX: contato direto com atendente]
- Confirmação: [EX: automática até X pessoas / manual acima disso]
- No-show: [EX: mesa mantida por 15 minutos após o horário]

---

## Regras para o Bot

> Define quando a IA deve transferir para atendente humano.

Transferir para humano se:
- Cliente reclamar de qualidade, erro no pedido, ou entrega extraviada
- Cliente pedir explicitamente por atendente humano
- Pedido corporativo / evento acima de R$ [XX] ou [X] pessoas
- Dúvida que envolva risco à saúde ou segurança
- Situação não mapeada nas regras acima

Não fazer sem autorização:
- Confirmar prazo diferente do padrão
- Oferecer desconto fora de promoções ativas

---

## Promoções Ativas

> Atualizar conforme campanhas vigentes. Remover linha se não houver promoção.

- [EX: Segunda é dia de desconto — 10% em pedidos acima de R$50]
- [EX: Combo família com frete grátis aos domingos]

---

_Última atualização: [DATA]_
