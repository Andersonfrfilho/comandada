# Configuração de Taxa de Entrega

A taxa de entrega é configurada na tabela `delivery_fee_rules`. Apenas uma regra pode estar ativa por vez (`active = true`).

O endereço do cliente é geocodificado via [Nominatim](https://nominatim.openstreetmap.org/) (gratuito, sem chave de API) e a rota é calculada via [OSRM](https://project-osrm.org/) (gratuito, sem chave de API).

---

## Colunas da tabela `delivery_fee_rules`

| Coluna | Tipo | Descrição |
|---|---|---|
| `mode` | texto | Modo de cálculo (ver abaixo) |
| `base_fee` | decimal | Taxa base em reais |
| `per_km_rate` | decimal | Adicional por km (modo `per_km`) |
| `per_min_rate` | decimal | Adicional por minuto de rota (modo `per_route_min`) |
| `free_above` | decimal | Pedidos acima deste valor têm frete grátis (0 = desabilitado) |
| `max_radius_km` | decimal | Raio máximo de entrega em km em linha reta |
| `active` | boolean | Apenas uma regra ativa por vez |

---

## Modo: `fixed` — taxa fixa

```sql
INSERT INTO delivery_fee_rules (mode, base_fee, free_above, max_radius_km, active)
VALUES ('fixed', 8.00, 80.00, 15, true);
```

- Todos os clientes pagam R$ 8,00
- Pedidos acima de R$ 80,00 têm frete grátis
- Clientes além de 15 km recebem oferta de retirada no local

---

## Modo: `per_km` — por quilômetro de rota

```sql
INSERT INTO delivery_fee_rules (mode, base_fee, per_km_rate, free_above, max_radius_km, active)
VALUES ('per_km', 3.00, 1.50, 100.00, 20, true);
```

Fórmula: `taxa = base_fee + distância_km × per_km_rate`

Exemplo: 8 km → `3,00 + 8 × 1,50 = R$ 15,00`

---

## Modo: `per_route_min` — por minuto de rota

```sql
INSERT INTO delivery_fee_rules (mode, base_fee, per_min_rate, free_above, max_radius_km, active)
VALUES ('per_route_min', 3.00, 0.30, 100.00, 20, true);
```

Fórmula: `taxa = base_fee + tempo_min × per_min_rate`

Exemplo: 25 min → `3,00 + 25 × 0,30 = R$ 10,50`

---

## Modo: `zones_km` — zonas por distância

```sql
INSERT INTO delivery_fee_rules (mode, base_fee, free_above, max_radius_km, active)
VALUES ('zones_km', 0, 80.00, 20, true);
```

Depois configure as zonas na tabela `delivery_fee_zones`:

```sql
INSERT INTO delivery_fee_zones (rule_id, zone_type, min_value, max_value, fee, label) VALUES
  (1, 'km', 0,  5,  6.00,  'Zona 1 — até 5 km'),
  (1, 'km', 5,  10, 10.00, 'Zona 2 — 5 a 10 km'),
  (1, 'km', 10, 20, 15.00, 'Zona 3 — 10 a 20 km');
```

A zona é selecionada por: `min_value <= distância_rota_km < max_value`

---

## Modo: `zones_min` — zonas por tempo de rota

```sql
INSERT INTO delivery_fee_rules (mode, base_fee, free_above, max_radius_km, active)
VALUES ('zones_min', 0, 80.00, 20, true);
```

```sql
INSERT INTO delivery_fee_zones (rule_id, zone_type, min_value, max_value, fee, label) VALUES
  (1, 'min', 0,  20, 5.00,  'Até 20 min'),
  (1, 'min', 20, 40, 9.00,  '20 a 40 min'),
  (1, 'min', 40, 60, 14.00, '40 a 60 min');
```

A zona é selecionada por: `min_value <= tempo_rota_min < max_value`

---

## Comportamento quando o endereço está fora da área

Se a distância em linha reta (`haversine`) for maior que `max_radius_km`, o bot não calcula rota e oferece a opção de retirada no local ao cliente. Se o cliente recusar, o pedido é cancelado.

## Mensagem exibida ao cliente

Após confirmar o endereço o cliente vê:

```
📍 Endereço encontrado:
_Rua das Flores, 123, Centro, São Paulo, SP_
🗺️ https://maps.google.com/?q=Rua+das+Flores...
🛵 Taxa: R$ 10,00 · ~22 min (7.3 km)

Adicione o complemento (ex: Apto 42, Bloco B) ou ok para confirmar.
```

Se o frete for grátis, aparece: `🎉 *Frete GRÁTIS!* · ~22 min (7.3 km)`
