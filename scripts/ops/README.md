# Scripts de operação (staging no Railway)

Rodam no seu computador, a partir da raiz do repositório. Precisam da CLI do Railway
(`railway login` feito), `curl` e `python3`. Nenhum segredo é impresso nem gravado no repositório.

| Ordem | Script | O que faz |
|---|---|---|
| 1 | `01-copiar-whatsapp-do-quickcart.sh` | Copia `WHATSAPP_*` da api do QuickCart para a api e o n8n do ComandAdA |
| 2 | `02-n8n-dono-e-workflows.sh` | Cria o dono do n8n, gera a API key e importa e ativa os workflows |
| 3 | `03-meta-apontar-webhook.sh` | Aponta o webhook do app da Meta para o n8n (é a troca de verdade) |
| 5 | `05-onde-esta-o-token-antigo.sh` | Varre todos os projetos e ambientes do Railway (produção incluída) e lista quem ainda usa o token antigo. Só lê |
| 4 | `04-meta-trocar-token.sh` | Grava o token novo depois de revogar o antigo na Meta (passo manual no topo do script) |

```bash
bash scripts/ops/01-copiar-whatsapp-do-quickcart.sh
N8N_OWNER_EMAIL=voce@exemplo.com bash scripts/ops/02-n8n-dono-e-workflows.sh
META_APP_ID=123456 bash scripts/ops/03-meta-apontar-webhook.sh
bash scripts/ops/04-meta-trocar-token.sh
```

Entrada pela API com worker (padrão dos outros bots, ver `docs/whatsapp-entrada-pela-api.md`): rode o 3 com
`META_CALLBACK_URL=https://api-comandada-yuyaki.up.railway.app/webhooks/whatsapp` depois de o serviço worker estar no ar.

Voltar para o QuickCart: rode o 3 com
`META_CALLBACK_URL=https://quickcart-api-staging.up.railway.app/v1/webhook/whatsapp`.

Só apague o QuickCart depois do 1: a CLI é o único lugar de onde o token sai sem você digitar.
