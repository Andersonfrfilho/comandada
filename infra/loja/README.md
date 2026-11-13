# Servidor da loja

O ComandAdA inteiro rodando num computador dentro do restaurante. Tablets, caixa e cozinha acessam pela
rede local, então o salão continua funcionando quando a internet cai. Quando a energia cai, o nobreak
segura servidor, roteador e impressora.

```
            nobreak
 ┌───────────────────────────────┐
 │ roteador ── switch ── servidor│  http://comandada.local
 │                 │             │   nginx  → painel + /api + /ws
 │          impressora térmica   │   api    → Bun (porta 3333, só na rede interna do Docker)
 └─────────────────┼─────────────┘   postgres, redis, backup de hora em hora
                   │ Wi-Fi do salão
     tablets · notebook do caixa · TV da cozinha (bateria própria)
```

## O que roda sem internet

| Função | Sem internet |
|---|---|
| Pedidos, mesas, comandas, cozinha, caixa, entregas | Funciona normal |
| Impressão na térmica de rede | Funciona normal |
| WhatsApp e bot | Para até a internet voltar (a Meta guarda as mensagens). Opcional: um roteador com 4G de reserva evita isso |
| NFC-e | Fica na fila e é reenviada quando a internet volta. Contingência offline com DANFE impresso é a fase 3 |
| Cartão | A maquininha com chip próprio não depende da internet da loja |
| Biblioteca de documentos das conversas | Fica só na nuvem (`STORAGE_ENABLED=false` aqui) |

## Hardware sugerido

| Item | Sugestão |
|---|---|
| Servidor | Mini PC Intel N100 ou superior, 16 GB de RAM, SSD de 256 GB ou mais |
| Sistema | Ubuntu Server 24.04 LTS |
| Nobreak | 1200 a 1500 VA com porta USB, ligando servidor, roteador, switch e impressora da cozinha |
| Rede | Roteador com reserva de IP (DHCP). Wi-Fi do salão separado do Wi-Fi de clientes. 4G de reserva é opcional |
| Impressora | Térmica com porta de rede (Ethernet), IP fixo |

## Instalação (uma vez)

1. **Ubuntu e Docker**
   ```bash
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker $USER && newgrp docker
   ```
2. **Nome na rede**: o painel fica em `http://comandada.local`.
   ```bash
   sudo hostnamectl set-hostname comandada
   sudo apt install -y avahi-daemon && sudo systemctl enable --now avahi-daemon
   ```
   Reserve um IP fixo para o servidor no roteador (ex.: `192.168.0.10`). Tablets Android antigos às vezes
   não resolvem `.local`: neles, use o IP direto (`http://192.168.0.10`).
3. **Ligar sozinho quando a energia volta**: na BIOS, ative "Restore on AC Power Loss" (ou "Power On").
   O Docker já sobe com o sistema e os containers usam `restart: always`.
4. **Subir o sistema**
   ```bash
   git clone https://github.com/Andersonfrfilho/comandada.git && cd comandada
   make loja-setup          # cria infra/loja/.env com senhas aleatórias
   nano infra/loja/.env     # ajuste FISCAL_PRINTER_INTERFACE com o IP da impressora
   make loja-up
   ```
5. **Dispositivos**: em cada tablet, abra `http://comandada.local` no Chrome e use "Instalar app" para
   fixar o painel na tela inicial.

## Nobreak: desligar com segurança

Com o nobreak ligado por USB, o NUT avisa o servidor quando a bateria está acabando e desliga tudo antes
de faltar energia de vez, sem corromper o banco.

```bash
sudo apt install -y nut
sudo nut-scanner -U            # descobre o nobreak e mostra o bloco de configuração
```

Coloque o bloco em `/etc/nut/ups.conf`, `MODE=standalone` em `/etc/nut/nut.conf` e reinicie com
`sudo systemctl restart nut-server nut-monitor`. Teste com `upsc <nome-do-nobreak>`.

Mesmo sem o NUT, o Postgres roda com `fsync` e `synchronous_commit` ligados e o Redis com AOF: um
desligamento brusco não perde pedido já confirmado na tela.

## Sincronização com a nuvem

A loja e a nuvem editam juntas. Tudo o que é feito na loja é gravado primeiro no servidor daqui e
enviado para a nuvem em lotes pequenos. O que entra pela nuvem (pedidos do WhatsApp, cardápio
editado de casa) desce para a loja do mesmo jeito.

- **Sem internet ou com sinal ruim**: a loja continua normal. As alterações ficam na fila e saem
  quando a conexão volta, em partes, com tempo limite curto, novas tentativas cada vez mais
  espaçadas e lote menor enquanto a conexão estiver ruim.
- **Seguro**: token compartilhado, checksum de cada lote e aplicação numa transação só. Se a
  conexão cai no meio, nada fica pela metade, e o reenvio do mesmo lote é ignorado.
- **Conflitos**: se os dois lados mudam a mesma coisa, vence a alteração mais recente (coluna por
  coluna). O status do pedido nunca anda para trás, e o estoque soma as baixas feitas dos dois
  lados. O que não dá para decidir sozinho (ex.: pedido cancelado na nuvem e finalizado na loja)
  aparece no painel, no indicador de sincronização do menu.
- **Caixa** (abrir, fechar, sangria) só pode ser alterado na loja.

Configuração:

| Onde | Variáveis |
|---|---|
| Nuvem | `SYNC_ROLE=nuvem`, `SYNC_TOKEN` (32+ caracteres) |
| Loja (`infra/loja/.env`) | `SYNC_ROLE=loja`, `SYNC_NODE_NAME`, `SYNC_PEER_URL` (endereço da API na nuvem), o mesmo `SYNC_TOKEN` |

Cuidados:

- Use o **mesmo `APP_SECRET`** da nuvem na loja: as credenciais fiscais vão criptografadas com ele.
- Emissão de NFC-e (`FISCAL_WORKER_ENABLED=true`) só na loja, para não emitir duas vezes.
- Na primeira vez, ligue o servidor da loja com internet para ele receber o cadastro da nuvem antes
  de abrir o salão (a agenda de encomendas cria as linhas de produção na primeira vez que é usada).

## Dia a dia

| Comando | O que faz |
|---|---|
| `make loja-ps` | Mostra se tudo está de pé |
| `make loja-logs` | Acompanha os logs |
| `make loja-backup` | Faz um backup agora |
| `make loja-restore FILE=infra/loja/backups/arquivo.dump` | Restaura um backup |
| `git pull && make loja-up` | Atualiza para a versão nova |

Os backups automáticos ficam em `infra/loja/backups/` (um por hora, os últimos 72 por padrão). Copie
essa pasta para um pendrive ou para a nuvem de vez em quando.

## Próximas fases

- **Fase 3**: NFC-e em contingência offline.
