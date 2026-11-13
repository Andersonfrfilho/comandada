-- ============================================
-- Dados de teste — simula um pedido completo
-- Executar: make test-order
-- Limpa dados de teste anteriores antes de inserir
-- ============================================

BEGIN;

-- Limpa dados de teste anteriores (identificados pelo prefixo TEL)
DELETE FROM perguntas_log  WHERE cliente_tel LIKE '5511900000%';
DELETE FROM pedido_status_log WHERE pedido_id IN (
  SELECT id FROM pedidos WHERE cliente_tel LIKE '5511900000%'
);
DELETE FROM pedidos        WHERE cliente_tel LIKE '5511900000%';
DELETE FROM reservas       WHERE cliente_tel LIKE '5511900000%';
DELETE FROM sessoes        WHERE telefone    LIKE '5511900000%';
DELETE FROM clientes       WHERE telefone    LIKE '5511900000%';

-- ============================================
-- Cliente
-- ============================================
INSERT INTO clientes (telefone, nome, enderecos, preferencias, total_atendimentos, total_gasto, primeiro_atendimento, ultimo_atendimento)
VALUES (
  '5511900000001',
  'João Silva',
  '[{"rua":"Rua das Flores","numero":"123","bairro":"Vila Madalena","complemento":"Apto 42","cep":"05435-000","lat":-23.5613,"lng":-46.6896}]',
  '{"ultimo_pedido":[2,9],"restricoes":"sem cream cheese"}',
  3,
  237.60,
  now() - INTERVAL '45 days',
  now() - INTERVAL '7 days'
);

-- ============================================
-- Sessão ativa (cliente em estado 'inicio')
-- ============================================
INSERT INTO sessoes (telefone, estado, carrinho, dados_temp, ultima_atividade)
VALUES (
  '5511900000001',
  'inicio',
  '[]',
  '{}',
  now()
);

-- ============================================
-- Pedido em andamento
-- ============================================
INSERT INTO pedidos (
  id, codigo, cliente_tel,
  itens, subtotal, taxa_entrega, desconto, total,
  tipo, endereco, pagamento,
  status, observacoes
)
VALUES (
  'a1b2c3d4-0000-0000-0000-000000000001',
  'PED-20260602-001',
  '5511900000001',
  '[
    {"id":2,"nome":"Combo Misto 16 Peças","qty":1,"preco_unit":79.90,"obs":""},
    {"id":16,"nome":"Edamame","qty":1,"preco_unit":14.90,"obs":""},
    {"id":23,"nome":"Refrigerante Lata","qty":2,"preco_unit":6.90,"obs":"Coca-Cola"}
  ]',
  108.60,
  0.00,
  0.00,
  108.60,
  'delivery',
  '{"rua":"Rua das Flores","numero":"123","bairro":"Vila Madalena","complemento":"Apto 42","cep":"05435-000","lat":-23.5613,"lng":-46.6896}',
  'pix',
  'preparando',
  'Sem cream cheese no combo'
);

-- Status log do pedido
INSERT INTO pedido_status_log (pedido_id, status, observacao) VALUES
  ('a1b2c3d4-0000-0000-0000-000000000001', 'recebido',   'Pedido recebido via WhatsApp'),
  ('a1b2c3d4-0000-0000-0000-000000000001', 'confirmado', 'PIX confirmado'),
  ('a1b2c3d4-0000-0000-0000-000000000001', 'preparando', 'Cozinha iniciou preparo');

-- ============================================
-- Pedido entregue (histórico)
-- ============================================
INSERT INTO pedidos (
  id, codigo, cliente_tel,
  itens, subtotal, taxa_entrega, desconto, total,
  tipo, endereco, pagamento,
  status, created_at, updated_at
)
VALUES (
  'a1b2c3d4-0000-0000-0000-000000000002',
  'PED-20260525-018',
  '5511900000001',
  '[
    {"id":9,"nome":"Hot Roll Salmão (8 un)","qty":1,"preco_unit":39.90,"obs":""},
    {"id":5,"nome":"Temaki Salmão","qty":2,"preco_unit":23.90,"obs":""}
  ]',
  87.70,
  0.00,
  0.00,
  87.70,
  'delivery',
  '{"rua":"Rua das Flores","numero":"123","bairro":"Vila Madalena","cep":"05435-000"}',
  'cartao',
  'entregue',
  now() - INTERVAL '7 days',
  now() - INTERVAL '7 days'
);

INSERT INTO pedido_status_log (pedido_id, status, observacao, created_at) VALUES
  ('a1b2c3d4-0000-0000-0000-000000000002', 'recebido',   'Pedido recebido', now() - INTERVAL '7 days'),
  ('a1b2c3d4-0000-0000-0000-000000000002', 'confirmado', 'Confirmado',      now() - INTERVAL '7 days'),
  ('a1b2c3d4-0000-0000-0000-000000000002', 'preparando', 'Em preparo',      now() - INTERVAL '7 days'),
  ('a1b2c3d4-0000-0000-0000-000000000002', 'saiu',       'Saiu para entrega', now() - INTERVAL '7 days'),
  ('a1b2c3d4-0000-0000-0000-000000000002', 'entregue',   'Entregue com sucesso', now() - INTERVAL '7 days');

-- ============================================
-- Interações com a IA
-- ============================================
INSERT INTO perguntas_log (cliente_tel, pergunta, resposta_ia, confianca, transferiu_humano, virou_faq) VALUES
  ('5511900000001', 'vocês têm opção sem glúten?',
   'Sim! Niguiris, temakis, sashimis, edamame, missoshiro e mochis são sem glúten. Os hot rolls e gyoza contêm glúten.',
   'alta', false, false),
  ('5511900000001', 'quanto tempo demora a entrega?',
   'O tempo médio é de 45 a 60 minutos. Nas sextas e sábados pode chegar a 70 minutos.',
   'alta', false, false),
  ('5511900000001', 'o salmão é fresco?',
   'Nosso salmão é importado e congelado a -20°C — processo seguro e obrigatório para sashimi pela ANVISA. O atum é fresco e comprado diariamente.',
   'alta', false, false),
  ('5511900000001', 'vocês fazem entrega no dia de natal?',
   NULL,
   'baixa', true, false);

-- Atualiza totais do cliente
UPDATE clientes
SET
  total_atendimentos = 3,
  total_gasto        = 237.60,
  ultimo_atendimento = now()
WHERE telefone = '5511900000001';

COMMIT;

-- Resumo do que foi inserido
SELECT 'clientes'        AS tabela, COUNT(*) AS registros FROM clientes       WHERE telefone LIKE '5511900000%'
UNION ALL
SELECT 'pedidos',         COUNT(*) FROM pedidos           WHERE cliente_tel LIKE '5511900000%'
UNION ALL
SELECT 'status_logs',     COUNT(*) FROM pedido_status_log WHERE pedido_id IN (SELECT id FROM pedidos WHERE cliente_tel LIKE '5511900000%')
UNION ALL
SELECT 'perguntas_ia',    COUNT(*) FROM perguntas_log     WHERE cliente_tel LIKE '5511900000%'
ORDER BY tabela;
