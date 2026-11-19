-- O nome oficial do restaurante é "Yuyake Sushi & Grill" (o do logo). O seed gravou "Yuyaki Sushi Bar",
-- que aparecia no cardápio online, no painel e na saudação do bot. Só troca o nome antigo: um nome
-- digitado depois em Configurações fica como está.
UPDATE establishments
SET name = 'Yuyake Sushi & Grill', updated_at = now()
WHERE name = 'Yuyaki Sushi Bar';
--> statement-breakpoint
UPDATE settings
SET value = to_jsonb('Yuyake Sushi & Grill'::text), updated_at = now()
WHERE key IN ('brand_name', 'establishment_name')
  AND value #>> '{}' = 'Yuyaki Sushi Bar';
