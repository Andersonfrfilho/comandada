-- Clientes e notas fiscais ganham permissão própria (antes bastava `orders:read`, então cozinha e entregador
-- liam CPF, e-mail e notas de todos os clientes). Quem já trabalhava com isso continua com acesso:
-- clientes para quem lança pedido (`orders:write`), notas para quem lança pedido ou mexe no caixa,
-- e tudo para quem administra cargos (`users:manage`). Idempotente: o seed roda o mesmo SQL.
INSERT INTO permissions (role_id, resource, action)
SELECT grant_row.role_id, grant_row.resource, grant_row.action
FROM (
  SELECT DISTINCT p.role_id, 'customers' AS resource, a.action
  FROM permissions p CROSS JOIN (VALUES ('read'), ('write')) AS a(action)
  WHERE p.resource = 'orders' AND p.action = 'write'
  UNION
  SELECT DISTINCT p.role_id, 'fiscal', a.action
  FROM permissions p CROSS JOIN (VALUES ('read'), ('write')) AS a(action)
  WHERE (p.resource = 'orders' AND p.action = 'write') OR (p.resource = 'cashier' AND p.action = 'write')
  UNION
  SELECT DISTINCT p.role_id, r.resource, a.action
  FROM permissions p
  CROSS JOIN (VALUES ('customers'), ('fiscal')) AS r(resource)
  CROSS JOIN (VALUES ('read'), ('write'), ('delete'), ('manage')) AS a(action)
  WHERE p.resource = 'users' AND p.action = 'manage'
) AS grant_row
WHERE NOT EXISTS (
  SELECT 1 FROM permissions existing
  WHERE existing.role_id = grant_row.role_id
    AND existing.resource = grant_row.resource
    AND existing.action = grant_row.action
);
