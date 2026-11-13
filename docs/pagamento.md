# Formas de Pagamento

## Configuração

As formas de pagamento disponíveis são definidas na tabela `payment_types`:

```sql
INSERT INTO payment_types (name, label, active) VALUES
  ('pix',     '💳 PIX',                true),
  ('credito', '💳 Cartão de Crédito',  true),
  ('debito',  '💳 Cartão de Débito',   true),
  ('dinheiro','💵 Dinheiro',           true);
```

- Qualquer número de formas pode estar ativa
- A coluna `name` é o identificador interno (sem espaços, sem acentos)
- A coluna `label` é o texto exibido ao cliente

---

## Fluxo padrão

Após o cliente confirmar o endereço (entrega) ou o tipo de pedido (retirada), o bot exibe as opções de pagamento:

```
Como vai pagar?

1. 💳 PIX
2. 💳 Cartão de Crédito
3. 💵 Dinheiro
4. 👥 Dividir entre pessoas
5. 💰 Pagamento misto

Digite o número da opção.
```

---

## Divisão entre pessoas

Disponível quando há pelo menos uma forma de pagamento ativa.

O cliente escolhe a opção **Dividir entre pessoas**, informa quantas pessoas são (2 a 30), e o bot calcula o valor por pessoa:

```
👥 4 pessoas

💰 Total: R$ 120,00
👤 Por pessoa: R$ 30,00

Como vai pagar?
[mesmas opções, sem "Dividir" novamente]
```

Cada pessoa pode pagar individualmente com qualquer forma disponível — isso é informativo para o entregador, o valor por pessoa fica no resumo do pedido.

---

## Pagamento misto (parte digital + parte dinheiro)

Disponível quando há pelo menos uma forma de pagamento que não seja dinheiro.

Fluxo:

1. Cliente escolhe **Pagamento misto**
2. Bot lista apenas as formas não-dinheiro:
   ```
   Qual forma digital?

   1. 💳 PIX
   2. 💳 Cartão de Crédito

   Digite o número.
   ```
3. Após escolher, bot pergunta o valor:
   ```
   💰 Pagamento misto

   Total: R$ 80,00

   Qual valor em PIX?
   (O restante será em dinheiro)

   Ex: 50
   ```
4. Confirmação final:
   ```
   ✅ Pedido confirmado!

   💰 Pagamento:
   • R$ 50,00 via 💳 PIX
   • R$ 30,00 via 💵 Dinheiro
   ```

---

## Troco

Quando a forma de pagamento é **dinheiro** (sozinha), o bot pergunta o troco:

```
💵 Troco para quanto? (Digite o valor ou *não* para sem troco)
```

O valor informado é salvo no pedido e exibido no resumo para o entregador.

---

## Resumo do pedido

O pedido salvo na tabela `orders` inclui:

| Campo | Conteúdo |
|---|---|
| `payment_method` | Ex: `pix`, `dinheiro`, `PIX + dinheiro` |
| `change_for` | Valor para troco (quando dinheiro) |
| `split_count` | Número de pessoas (quando dividido) |

O webhook da cozinha (workflow `02`) recebe esses campos para exibir no painel de pedidos.
