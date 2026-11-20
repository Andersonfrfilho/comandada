-- Nome do perfil do WhatsApp que a Meta manda em cada mensagem. A lista de conversas mostrava só o
-- telefone: o nome só era gravado quando o cliente começava com "oi" e passava na validação do bot.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS whatsapp_profile_name varchar(255);
