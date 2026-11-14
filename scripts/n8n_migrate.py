#!/usr/bin/env python3
"""Aplica n8n/workflows/*.json no n8n pela API pública, como uma migration.

Para cada arquivo:
  - não existe no n8n (pelo nome)      → cria;
  - existe e o conteúdo é o mesmo      → não mexe (nem desativa);
  - existe e o conteúdo mudou          → desativa, atualiza e reativa;
  - ativação segue n8n/manifest.json   → true liga, false desliga, "keep" não mexe.

"Mesmo conteúdo" compara o que o repositório manda (nome, nós, conexões, settings) com o que está
no n8n, olhando só os campos que o arquivo define: o n8n acrescenta coisas ao salvar (webhookId,
settings padrão) e isso não conta como mudança. Rodar duas vezes seguidas não faz nada na segunda.

Só biblioteca padrão do Python, para rodar no GitHub Actions, no Railway ou na sua máquina.

Variáveis:
  N8N_URL                      URL do n8n (padrão http://localhost:5678)
  N8N_API_KEY                  API key (Settings → n8n API)
  N8N_POSTGRES_CREDENTIAL_ID   id da credencial "Postgres account" deste n8n (opcional: sem ela,
                               procura pelo nome; sem achar, mantém o id do JSON)
  DRY_RUN=1                    só mostra o que faria
"""
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parent.parent
WORKFLOWS_DIR = REPOSITORY_ROOT / "n8n" / "workflows"
MANIFEST_FILE = REPOSITORY_ROOT / "n8n" / "manifest.json"
READ_ONLY_KEYS = ("id", "active", "versionId", "activeVersionId", "activeVersion", "tags", "shared",
                  "pinData", "meta", "createdAt", "updatedAt", "isArchived", "triggerCount")
POSTGRES_CREDENTIAL_NAME = "Postgres account"


class N8nClient:
    def __init__(self, base_url: str, api_key: str):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key

    def request(self, method: str, path: str, body: object = None) -> object:
        data = None if body is None else json.dumps(body).encode()
        request = urllib.request.Request(
            f"{self.base_url}/api/v1{path}", data=data, method=method,
            headers={"X-N8N-API-KEY": self.api_key, "Content-Type": "application/json",
                     "Accept": "application/json"})
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                raw = response.read()
        except urllib.error.HTTPError as error:
            detail = error.read().decode(errors="replace")[:500]
            raise RuntimeError(f"{method} {path} → HTTP {error.code}: {detail}") from None
        return json.loads(raw) if raw else {}

    def list_workflows(self) -> list:
        workflows, cursor = [], None
        while True:
            query = "/workflows?limit=250" + (f"&cursor={cursor}" if cursor else "")
            page = self.request("GET", query)
            workflows.extend(page.get("data", []))
            cursor = page.get("nextCursor")
            if not cursor:
                return workflows

    def find_credential_id(self, name: str, credential_type: str) -> str | None:
        # GET /credentials só existe nas versões mais novas do n8n; nas antigas, segue sem.
        try:
            page = self.request("GET", "/credentials?limit=250")
        except RuntimeError:
            return None
        for credential in page.get("data", []):
            if credential.get("name") == name and credential.get("type") == credential_type:
                return str(credential.get("id"))
        return None


def wait_until_healthy(base_url: str, attempts: int = 40) -> None:
    for attempt in range(1, attempts + 1):
        try:
            with urllib.request.urlopen(f"{base_url.rstrip('/')}/healthz", timeout=10):
                return
        except Exception:
            print(f"  Aguardando o n8n responder... ({attempt}/{attempts})", flush=True)
            time.sleep(3)
    raise SystemExit(f"ERRO: o n8n não respondeu em {base_url}/healthz")


def build_payload(workflow_file: Path, postgres_credential_id: str | None) -> dict:
    workflow = json.loads(workflow_file.read_text())
    for key in READ_ONLY_KEYS:
        workflow.pop(key, None)
    # Os JSONs apontam para a credencial do n8n onde foram exportados; aqui ela tem outro id.
    if postgres_credential_id:
        for node in workflow.get("nodes", []):
            postgres = (node.get("credentials") or {}).get("postgres")
            if postgres is not None:
                postgres["id"] = postgres_credential_id
    workflow.setdefault("settings", {"executionOrder": "v1"})
    return {key: workflow[key] for key in ("name", "nodes", "connections", "settings") if key in workflow}


def is_subset(expected: object, actual: object) -> bool:
    """True quando tudo que `expected` define está igual em `actual` (campos a mais em `actual` não contam)."""
    if isinstance(expected, dict):
        return isinstance(actual, dict) and all(
            key in actual and is_subset(value, actual[key]) for key, value in expected.items())
    if isinstance(expected, list):
        return (isinstance(actual, list) and len(expected) == len(actual)
                and all(is_subset(item, other) for item, other in zip(expected, actual)))
    return expected == actual


def same_content(payload: dict, remote: dict) -> bool:
    remote_nodes = {node.get("name"): node for node in remote.get("nodes", [])}
    local_nodes = payload.get("nodes", [])
    if len(local_nodes) != len(remote_nodes):
        return False
    for node in local_nodes:
        if not is_subset(node, remote_nodes.get(node.get("name"))):
            return False
    return (payload.get("name") == remote.get("name")
            and payload.get("connections", {}) == remote.get("connections", {})
            and is_subset(payload.get("settings", {}), remote.get("settings") or {}))


def content_hash(payload: dict) -> str:
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()[:12]


def load_manifest() -> dict:
    if not MANIFEST_FILE.exists():
        return {}
    return json.loads(MANIFEST_FILE.read_text()).get("workflows", {})


def main() -> int:
    base_url = os.environ.get("N8N_URL") or (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5678")
    api_key = os.environ.get("N8N_API_KEY", "")
    dry_run = os.environ.get("DRY_RUN") == "1"
    if not api_key:
        print("ERRO: N8N_API_KEY não definida (n8n → Settings → n8n API → Create API Key).")
        return 1

    print(f"Migrando workflows para {base_url}{' (DRY_RUN: nada é alterado)' if dry_run else ''}...")
    wait_until_healthy(base_url)
    client = N8nClient(base_url, api_key)

    postgres_credential_id = (os.environ.get("N8N_POSTGRES_CREDENTIAL_ID")
                              or client.find_credential_id(POSTGRES_CREDENTIAL_NAME, "postgres"))
    if not postgres_credential_id:
        print(f"  ! Credencial '{POSTGRES_CREDENTIAL_NAME}' não encontrada; os crons usam o id do JSON.")

    remote_by_name: dict[str, list] = {}
    for workflow in client.list_workflows():
        remote_by_name.setdefault(workflow.get("name"), []).append(workflow)

    manifest = load_manifest()
    counts = {"criado": 0, "atualizado": 0, "igual": 0, "falha": 0}

    def set_active(workflow_id: str, active: bool) -> None:
        if not dry_run:
            client.request("POST", f"/workflows/{workflow_id}/{'activate' if active else 'deactivate'}", {})

    for workflow_file in sorted(WORKFLOWS_DIR.glob("*.json")):
        desired = manifest.get(workflow_file.name, {}).get("active", "keep")
        try:
            payload = build_payload(workflow_file, postgres_credential_id)
            name = payload.get("name")
            if not name:
                continue
            label = f"'{name}' [{content_hash(payload)}]"
            matches = remote_by_name.get(name, [])
            if len(matches) > 1:
                ids = ", ".join(str(match.get("id")) for match in matches)
                print(f"  ! {len(matches)} workflows com o nome '{name}' no n8n (ids {ids}); uso o primeiro.")

            if not matches:
                print(f"  + Criando {label}")
                if dry_run:
                    counts["criado"] += 1
                    continue
                created = client.request("POST", "/workflows", payload)
                if desired is True:
                    set_active(created["id"], True)
                counts["criado"] += 1
                continue

            remote_id = str(matches[0]["id"])
            remote = client.request("GET", f"/workflows/{remote_id}")
            was_active = bool(remote.get("active"))
            should_be_active = was_active if desired == "keep" else bool(desired)

            if same_content(payload, remote) and not remote.get("isArchived"):
                if was_active != should_be_active:
                    print(f"  = {label} sem mudança; {'ativando' if should_be_active else 'desativando'}")
                    set_active(remote_id, should_be_active)
                else:
                    print(f"  = {label} sem mudança")
                counts["igual"] += 1
                continue

            print(f"  ↺ Atualizando {label} (id {remote_id})")
            if not dry_run:
                if was_active:
                    set_active(remote_id, False)
                if remote.get("isArchived"):
                    client.request("POST", f"/workflows/{remote_id}/unarchive", {})
                client.request("PUT", f"/workflows/{remote_id}", payload)
                if should_be_active:
                    set_active(remote_id, True)
            counts["atualizado"] += 1
        except Exception as error:  # um workflow com problema não impede os outros
            print(f"  ✗ {workflow_file.name}: {error}")
            counts["falha"] += 1

    print(f"\nConcluído: {counts['criado']} criado(s), {counts['atualizado']} atualizado(s), "
          f"{counts['igual']} sem mudança, {counts['falha']} falha(s).")
    return 1 if counts["falha"] else 0


if __name__ == "__main__":
    sys.exit(main())
