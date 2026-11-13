-- Sincronização loja <-> nuvem (offline-first). Tudo fica no schema `sync` e só liga quando a API
-- sobe com SYNC_ROLE: sem isso nenhuma trigger é criada e o banco se comporta como antes.
--
-- Como funciona:
--   * cada escrita numa tabela sincronizada vira uma linha em sync.changes (trigger sync.capture),
--     com um relógio lógico híbrido (HLC) e o nó de origem;
--   * o worker da loja envia as mudanças locais e puxa as da nuvem em lotes;
--   * sync.apply_change aplica cada mudança recebida com a regra da tabela: última escrita vence
--     por coluna, estado mais avançado vence, contadores somam a diferença, e o que não dá para
--     resolver sozinho vai para sync.conflicts.
CREATE SCHEMA IF NOT EXISTS sync;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS sync.state (
  "id" boolean PRIMARY KEY DEFAULT true CHECK ("id"),
  "node_id" text NOT NULL,
  "role" text NOT NULL CHECK ("role" IN ('loja', 'nuvem')),
  -- Maior tempo físico (ms) visto em mudanças recebidas: mantém o HLC monotônico mesmo com relógio atrasado.
  "max_seen_physical" bigint NOT NULL DEFAULT 0,
  "backlog_seeded_at" timestamp with time zone,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS sync.hlc_counter;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS sync.tables (
  "table_name" text PRIMARY KEY,
  -- Chave primária (uma ou mais colunas). A chave em texto é os valores unidos por "|".
  "pk_columns" text[] NOT NULL,
  "position" integer NOT NULL,
  "state_column" text,
  "state_ranks" jsonb,
  "counter_columns" text[] NOT NULL DEFAULT '{}',
  -- Só nós desse papel podem escrever (ex.: caixa só na loja). Mudança de outro papel vira conflito.
  "owner_role" text CHECK ("owner_role" IN ('loja', 'nuvem'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS sync.changes (
  "seq" bigserial PRIMARY KEY,
  "table_name" text NOT NULL,
  "pk" text NOT NULL,
  "key" jsonb NOT NULL,
  "op" char(1) NOT NULL CHECK ("op" IN ('I', 'U', 'D')),
  "data" jsonb,
  "old_data" jsonb,
  "hlc" text NOT NULL,
  "origin" text NOT NULL,
  "origin_seq" bigint,
  -- Transação que gravou a mudança. A leitura vai em ordem (xid, seq) e só até o menor xid ainda
  -- aberto, assim uma transação lenta nunca fica para trás do cursor.
  "xid" bigint NOT NULL DEFAULT (pg_current_xact_id()::text::bigint),
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS changes_origin_cursor_idx ON sync.changes ("origin", "xid", "seq");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS changes_cursor_idx ON sync.changes ("xid", "seq");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS sync.row_clock (
  "table_name" text NOT NULL,
  "pk" text NOT NULL,
  "hlc" text NOT NULL,
  PRIMARY KEY ("table_name", "pk")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS sync.field_clock (
  "table_name" text NOT NULL,
  "pk" text NOT NULL,
  "column_name" text NOT NULL,
  "hlc" text NOT NULL,
  PRIMARY KEY ("table_name", "pk", "column_name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS sync.peers (
  "peer_id" text PRIMARY KEY,
  -- Loja: até onde já enviou (seq local) e até onde já puxou (seq da nuvem).
  -- Cursores são o par (xid, seq) da última mudança.
  "last_pushed_xid" bigint NOT NULL DEFAULT 0,
  "last_pushed_seq" bigint NOT NULL DEFAULT 0,
  "last_pulled_xid" bigint NOT NULL DEFAULT 0,
  "last_pulled_seq" bigint NOT NULL DEFAULT 0,
  -- Nuvem: última mudança da loja já aplicada. Reenvio do mesmo lote é ignorado (idempotente).
  "last_received_xid" bigint NOT NULL DEFAULT 0,
  "last_received_seq" bigint NOT NULL DEFAULT 0,
  "last_success_at" timestamp with time zone,
  "last_attempt_at" timestamp with time zone,
  "last_error" text,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS sync.conflicts (
  "id" bigserial PRIMARY KEY,
  "table_name" text NOT NULL,
  "pk" text NOT NULL,
  "change" jsonb NOT NULL,
  "reason" text NOT NULL,
  -- retry: tenta de novo sozinho (ex.: linha-pai ainda não chegou); open: precisa de alguém; resolved/discarded.
  "status" text NOT NULL DEFAULT 'open' CHECK ("status" IN ('retry', 'open', 'resolved', 'discarded')),
  "attempts" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS conflicts_status_idx ON sync.conflicts ("status");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION sync.row_key(p_row jsonb, p_columns text[]) RETURNS jsonb AS $$
  SELECT jsonb_object_agg(key_column, p_row -> key_column) FROM unnest(p_columns) AS key_column;
$$ LANGUAGE sql IMMUTABLE;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION sync.key_text(p_key jsonb, p_columns text[]) RETURNS text AS $$
  SELECT string_agg(p_key ->> key_column, '|' ORDER BY position) FROM unnest(p_columns) WITH ORDINALITY AS columns(key_column, position);
$$ LANGUAGE sql IMMUTABLE;
--> statement-breakpoint
-- WHERE que usa o índice da chave: compara a coluna com o valor já convertido para o tipo dela.
CREATE OR REPLACE FUNCTION sync.key_predicate(p_table text, p_columns text[]) RETURNS text AS $$
  SELECT string_agg(format('t.%I = (jsonb_populate_record(NULL::%s, $1)).%I', key_column, p_table, key_column), ' AND ')
    FROM unnest(p_columns) AS key_column;
$$ LANGUAGE sql IMMUTABLE;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION sync.next_hlc() RETURNS text AS $$
DECLARE
  v_node text;
  v_seen bigint;
  v_physical bigint;
BEGIN
  SELECT node_id, max_seen_physical INTO v_node, v_seen FROM sync.state;
  IF v_node IS NULL THEN
    RETURN NULL;
  END IF;
  v_physical := greatest((extract(epoch FROM clock_timestamp()) * 1000)::bigint, v_seen);
  RETURN lpad(v_physical::text, 15, '0') || '-' || lpad(nextval('sync.hlc_counter')::text, 12, '0') || '-' || v_node;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION sync.capture() RETURNS trigger AS $$
DECLARE
  v_table text := TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME;
  v_pk_columns text[];
  v_key jsonb;
  v_origin text;
  v_hlc text;
  v_origin_seq bigint;
  v_new jsonb;
  v_old jsonb;
  v_data jsonb;
  v_old_data jsonb;
  v_pk text;
  v_op char(1);
BEGIN
  SELECT pk_columns INTO v_pk_columns FROM sync.tables WHERE table_name = v_table;
  IF v_pk_columns IS NULL THEN
    RETURN NULL;
  END IF;

  -- Mudança aplicada pelo sincronizador carrega a origem e o relógio de quem escreveu primeiro.
  v_origin := nullif(current_setting('comandada.sync_origin', true), '');
  IF v_origin IS NULL THEN
    SELECT node_id INTO v_origin FROM sync.state;
    IF v_origin IS NULL THEN
      RETURN NULL;
    END IF;
    v_hlc := sync.next_hlc();
  ELSE
    v_hlc := current_setting('comandada.sync_hlc');
    v_origin_seq := nullif(current_setting('comandada.sync_origin_seq', true), '')::bigint;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_op := 'I';
    v_new := to_jsonb(NEW);
    v_data := v_new;
    v_key := sync.row_key(v_new, v_pk_columns);
  ELSIF TG_OP = 'DELETE' THEN
    v_op := 'D';
    v_old := to_jsonb(OLD);
    v_old_data := v_old;
    v_key := sync.row_key(v_old, v_pk_columns);
  ELSE
    v_op := 'U';
    v_new := to_jsonb(NEW);
    v_old := to_jsonb(OLD);
    v_key := sync.row_key(v_new, v_pk_columns);
    SELECT jsonb_object_agg(changed.key, changed.value), jsonb_object_agg(changed.key, v_old -> changed.key)
      INTO v_data, v_old_data
      FROM jsonb_each(v_new) AS changed
     WHERE (v_old -> changed.key) IS DISTINCT FROM changed.value;
    IF v_data IS NULL THEN
      RETURN NULL;
    END IF;
  END IF;

  v_pk := sync.key_text(v_key, v_pk_columns);

  INSERT INTO sync.changes (table_name, pk, key, op, data, old_data, hlc, origin, origin_seq)
  VALUES (v_table, v_pk, v_key, v_op, v_data, v_old_data, v_hlc, v_origin, v_origin_seq);

  IF v_op = 'I' THEN
    INSERT INTO sync.row_clock (table_name, pk, hlc) VALUES (v_table, v_pk, v_hlc)
    ON CONFLICT (table_name, pk) DO UPDATE SET hlc = excluded.hlc WHERE sync.row_clock.hlc < excluded.hlc;
  ELSIF v_op = 'U' THEN
    INSERT INTO sync.field_clock (table_name, pk, column_name, hlc)
    SELECT v_table, v_pk, changed_column, v_hlc FROM jsonb_object_keys(v_data) AS changed_column
    ON CONFLICT (table_name, pk, column_name) DO UPDATE SET hlc = excluded.hlc WHERE sync.field_clock.hlc < excluded.hlc;
  ELSE
    DELETE FROM sync.row_clock WHERE table_name = v_table AND pk = v_pk;
    DELETE FROM sync.field_clock WHERE table_name = v_table AND pk = v_pk;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
-- Aplica uma mudança vinda de outro nó. Devolve 'applied', 'skipped' ou 'conflict'.
-- Nunca levanta erro: falha vira linha em sync.conflicts para o lote continuar.
CREATE OR REPLACE FUNCTION sync.apply_change(p_change jsonb) RETURNS text AS $$
DECLARE
  v_table text := p_change ->> 'table_name';
  v_pk text := p_change ->> 'pk';
  v_key jsonb := p_change -> 'key';
  v_predicate text;
  v_op text := p_change ->> 'op';
  v_hlc text := p_change ->> 'hlc';
  v_origin text := p_change ->> 'origin';
  v_data jsonb := p_change -> 'data';
  v_old_data jsonb := p_change -> 'old_data';
  v_config sync.tables;
  v_local_role text;
  v_current jsonb;
  v_apply jsonb := '{}'::jsonb;
  v_column text;
  v_incoming jsonb;
  v_local jsonb;
  v_base jsonb;
  v_local_clock text;
  v_row_clock text;
  v_incoming_rank integer;
  v_local_rank integer;
  v_column_list text;
  v_select_list text;
  v_conflict_reason text;
BEGIN
  SELECT * INTO v_config FROM sync.tables WHERE table_name = v_table;
  IF NOT FOUND THEN
    RETURN 'skipped';
  END IF;

  SELECT role INTO v_local_role FROM sync.state;

  -- Tabela que só um papel escreve: a escrita do outro lado não é aplicada aqui.
  IF v_config.owner_role IS NOT NULL AND v_local_role = v_config.owner_role
     AND split_part(v_origin, ':', 1) <> v_config.owner_role THEN
    INSERT INTO sync.conflicts (table_name, pk, change, reason, status)
    VALUES (v_table, v_pk, p_change, 'Só a ' || v_config.owner_role || ' pode alterar esta tabela', 'open');
    RETURN 'conflict';
  END IF;

  v_predicate := sync.key_predicate(v_table, v_config.pk_columns);

  -- Uma mudança mais nova do mesmo nó nas mesmas colunas substitui um conflito antigo dele: é o
  -- caso de alguém resolver o conflito do outro lado.
  IF v_data IS NOT NULL THEN
    UPDATE sync.conflicts
       SET status = 'resolved', resolved_at = now()
     WHERE table_name = v_table AND pk = v_pk AND status = 'open'
       AND change ->> 'origin' = v_origin AND change ->> 'hlc' < v_hlc
       AND (change -> 'data') ?| ARRAY(SELECT jsonb_object_keys(v_data));
  END IF;

  UPDATE sync.state
     SET max_seen_physical = greatest(max_seen_physical, split_part(v_hlc, '-', 1)::bigint);

  PERFORM set_config('comandada.sync_origin', v_origin, true);
  PERFORM set_config('comandada.sync_hlc', v_hlc, true);
  PERFORM set_config('comandada.sync_origin_seq', coalesce(p_change ->> 'seq', ''), true);

  BEGIN
    EXECUTE format('SELECT to_jsonb(t) FROM %s t WHERE %s', v_table, v_predicate)
      INTO v_current USING v_key;

    IF v_op = 'D' THEN
      IF v_current IS NULL THEN
        RETURN 'skipped';
      END IF;
      EXECUTE format('DELETE FROM %s t WHERE %s', v_table, v_predicate) USING v_key;
      RETURN 'applied';
    END IF;

    IF v_op = 'I' AND v_current IS NULL THEN
      EXECUTE format('INSERT INTO %s SELECT * FROM jsonb_populate_record(NULL::%s, $1)', v_table, v_table)
        USING v_data;
      RETURN 'applied';
    END IF;

    IF v_current IS NULL THEN
      -- Atualização de uma linha que ainda não existe aqui: tenta de novo nos próximos ciclos.
      INSERT INTO sync.conflicts (table_name, pk, change, reason, status)
      VALUES (v_table, v_pk, p_change, 'Linha ainda não existe neste lado', 'retry');
      RETURN 'conflict';
    END IF;

    SELECT hlc INTO v_row_clock FROM sync.row_clock WHERE table_name = v_table AND pk = v_pk;

    FOR v_column, v_incoming IN SELECT key, value FROM jsonb_each(v_data) LOOP
      CONTINUE WHEN v_column = ANY (v_config.pk_columns);
      v_local := v_current -> v_column;
      CONTINUE WHEN v_local IS NOT DISTINCT FROM v_incoming;
      v_base := CASE WHEN v_old_data IS NOT NULL AND v_old_data ? v_column THEN v_old_data -> v_column END;

      IF v_column = ANY (v_config.counter_columns) AND v_base IS NOT NULL THEN
        -- Contador: soma a diferença feita do outro lado, em vez de sobrescrever.
        v_apply := v_apply || jsonb_build_object(
          v_column,
          coalesce((v_local #>> '{}')::numeric, 0) + (v_incoming #>> '{}')::numeric - (v_base #>> '{}')::numeric
        );
      ELSIF v_base IS NOT NULL AND v_local IS NOT DISTINCT FROM v_base THEN
        -- Ninguém mexeu nesta coluna aqui desde a versão que o outro lado viu: aplica direto.
        v_apply := v_apply || jsonb_build_object(v_column, v_incoming);
      ELSIF v_column = v_config.state_column AND v_config.state_ranks IS NOT NULL THEN
        v_incoming_rank := (v_config.state_ranks ->> (v_incoming #>> '{}'))::integer;
        v_local_rank := (v_config.state_ranks ->> (v_local #>> '{}'))::integer;
        IF v_incoming_rank > v_local_rank THEN
          v_apply := v_apply || jsonb_build_object(v_column, v_incoming);
        ELSIF v_incoming_rank = v_local_rank THEN
          v_conflict_reason := format('%s: "%s" aqui e "%s" do outro lado', v_column, v_local #>> '{}', v_incoming #>> '{}');
        END IF;
      ELSE
        -- Os dois mudaram a mesma coluna: vence a escrita mais recente (HLC).
        SELECT hlc INTO v_local_clock FROM sync.field_clock
         WHERE table_name = v_table AND pk = v_pk AND column_name = v_column;
        IF v_hlc > coalesce(v_local_clock, v_row_clock, '') THEN
          v_apply := v_apply || jsonb_build_object(v_column, v_incoming);
        END IF;
      END IF;
    END LOOP;

    IF v_conflict_reason IS NOT NULL THEN
      INSERT INTO sync.conflicts (table_name, pk, change, reason, status)
      VALUES (v_table, v_pk, p_change, v_conflict_reason, 'open');
    END IF;

    IF v_apply = '{}'::jsonb THEN
      RETURN CASE WHEN v_conflict_reason IS NULL THEN 'skipped' ELSE 'conflict' END;
    END IF;

    SELECT string_agg(format('%I', key), ', '), string_agg(format('r.%I', key), ', ')
      INTO v_column_list, v_select_list
      FROM jsonb_object_keys(v_apply) AS key;

    EXECUTE format(
      'UPDATE %s t SET (%s) = (SELECT %s FROM jsonb_populate_record(NULL::%s, $2) r) WHERE %s',
      v_table, v_column_list, v_select_list, v_table, v_predicate
    ) USING v_key, v_apply;

    RETURN CASE WHEN v_conflict_reason IS NULL THEN 'applied' ELSE 'conflict' END;
  EXCEPTION WHEN others THEN
    INSERT INTO sync.conflicts (table_name, pk, change, reason, status)
    VALUES (v_table, v_pk, p_change, SQLERRM, 'retry');
    RETURN 'conflict';
  END;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
-- Reaplica conflitos marcados como 'retry' (ex.: o pedido chegou depois do item). Depois de 5
-- tentativas o conflito vai para 'open' e aparece no painel.
CREATE OR REPLACE FUNCTION sync.retry_conflicts(p_limit integer DEFAULT 100) RETURNS integer AS $$
DECLARE
  v_conflict sync.conflicts;
  v_result text;
  v_resolved integer := 0;
  v_before bigint;
BEGIN
  FOR v_conflict IN
    SELECT * FROM sync.conflicts WHERE status = 'retry' ORDER BY id LIMIT p_limit FOR UPDATE SKIP LOCKED
  LOOP
    SELECT coalesce(max(id), 0) INTO v_before FROM sync.conflicts;
    v_result := sync.apply_change(v_conflict.change);
    -- A nova tentativa que falha registra outro conflito: descarta esse registro duplicado.
    DELETE FROM sync.conflicts WHERE id > v_before AND table_name = v_conflict.table_name AND pk = v_conflict.pk;
    IF v_result IN ('applied', 'skipped') THEN
      UPDATE sync.conflicts SET status = 'resolved', resolved_at = now(), attempts = attempts + 1 WHERE id = v_conflict.id;
      v_resolved := v_resolved + 1;
    ELSE
      UPDATE sync.conflicts
         SET attempts = attempts + 1,
             status = CASE WHEN attempts + 1 >= 5 THEN 'open' ELSE 'retry' END
       WHERE id = v_conflict.id;
    END IF;
  END LOOP;
  RETURN v_resolved;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
-- Primeira ligação de um nó: registra as linhas que já existem como inserções, para o outro lado
-- receber o histórico. Roda uma vez só (backlog_seeded_at).
CREATE OR REPLACE FUNCTION sync.seed_backlog() RETURNS bigint AS $$
DECLARE
  v_config sync.tables;
  v_node text;
  v_count bigint := 0;
  v_inserted bigint;
BEGIN
  SELECT node_id INTO v_node FROM sync.state WHERE backlog_seeded_at IS NULL FOR UPDATE;
  IF v_node IS NULL THEN
    RETURN 0;
  END IF;
  FOR v_config IN SELECT * FROM sync.tables ORDER BY position LOOP
    EXECUTE format(
      'WITH rows AS (SELECT sync.row_key(to_jsonb(t), $3) AS key, to_jsonb(t) AS data FROM %s t),
            logged AS (
              INSERT INTO sync.changes (table_name, pk, key, op, data, hlc, origin)
              SELECT $1, sync.key_text(rows.key, $3), rows.key, ''I'', rows.data, sync.next_hlc(), $2 FROM rows
              RETURNING pk, hlc
            )
       INSERT INTO sync.row_clock (table_name, pk, hlc) SELECT $1, pk, hlc FROM logged
       ON CONFLICT (table_name, pk) DO NOTHING',
      v_config.table_name
    ) USING v_config.table_name, v_node, v_config.pk_columns;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    v_count := v_count + v_inserted;
  END LOOP;
  UPDATE sync.state SET backlog_seeded_at = now(), updated_at = now();
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;
