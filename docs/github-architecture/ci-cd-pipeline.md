# CI/CD Pipeline con GitHub Actions

**Fecha:** 2026-04-29

---

## ¿Qué es CI/CD?

**CI (Continuous Integration):** cada vez que subís código, se corren tests automáticamente para verificar que no rompiste nada.

**CD (Continuous Deployment):** si los tests pasan, el código se deploya automáticamente a producción.

Sin CI/CD:
```
escribís código
  → acordate de correr tests
  → acordate de buildear Docker
  → acordate de pushear a ECR
  → acordate de actualizar Lambda
```
Todo manual, todo propenso a errores humanos.

Con CI/CD:
```
git push → todo lo demás pasa solo
```

---

## ¿Cómo funciona GitHub Actions?

GitHub Actions lee archivos `.yml` que vivén en `.github/workflows/`. Cada vez que ocurre un evento (push, PR, etc.), GitHub levanta una máquina virtual limpia (Ubuntu), clona el repo, y ejecuta los pasos definidos en el `.yml`.

**Todo el contenido de los workflows fue configurado manualmente** — GitHub Actions no genera nada automáticamente, solo ejecuta lo que está escrito en los archivos `.yml`.

Los bloques `uses:` (como `actions/checkout@v4`) son "actions" pre-construidas que la comunidad publica. Son el equivalente a importar una librería: GitHub las descarga y ejecuta. Las de `aws-actions/` son mantenidas por AWS oficialmente.

---

## Workflow 1: CI (`ci.yml`)

**Trigger:** push a `main` o `develop`, o PR hacia `main`

```yaml
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]
```

| Paso | Qué hace |
|------|----------|
| `actions/checkout@v4` | Clona el repo en la VM de GitHub |
| `actions/setup-python@v5` | Instala Python 3.12 |
| `pip install -r requirements.txt` | Instala todas las dependencias |
| `pytest tests/ -v` | Corre los tests y reporta resultados |

**Propósito:** feedback rápido. Si un PR rompe algo, el desarrollador lo sabe antes de mergear a `main`.

---

## Workflow 2: Deploy (`deploy.yml`)

**Trigger:** push a `main` únicamente

```yaml
on:
  push:
    branches: [main]
```

| Paso | Qué hace |
|------|----------|
| `actions/checkout@v4` | Clona el repo |
| `aws-actions/configure-aws-credentials@v4` | Autentica con AWS usando los secrets del repo |
| `aws-actions/amazon-ecr-login@v2` | Hace login al registro Docker de AWS (ECR) |
| `docker build --secret id=google_api_key,...` | Buildea la imagen multi-stage (genera índice FAISS con la API key como secret de BuildKit) |
| `docker push` | Sube la imagen a ECR con dos tags: `latest` y `<git-sha>` |
| `aws lambda update-function-code` | Le dice a Lambda que use la nueva imagen |
| `aws lambda wait function-updated` | Espera hasta que Lambda terminó de deployar |
| Deployment summary | Escribe un resumen en la UI de GitHub Actions |

### Secrets requeridos en GitHub (Settings → Secrets → Actions)

| Secret | Propósito |
|--------|-----------|
| `AWS_ACCESS_KEY_ID` | Credencial del usuario IAM `nomadai-github-actions` |
| `AWS_SECRET_ACCESS_KEY` | Credencial del usuario IAM `nomadai-github-actions` |
| `GOOGLE_API_KEY` | API key de Google — usada durante el `docker build` para generar los embeddings del índice FAISS |

El usuario IAM `nomadai-github-actions` tiene permisos mínimos (principio de least privilege):
- ECR: push/pull solo al repositorio `nomadai`
- Lambda: `UpdateFunctionCode` y `GetFunction` solo en la función `nomadai`

---

## Flujo completo de un deploy

```
git push origin main
        │
        ▼
GitHub detecta el push
        │
        ├─► CI workflow (VM #1) — corre en paralelo
        │     instala deps
        │     pytest tests/ -v
        │     ✅ o ❌ (reportado en la PR/commit)
        │
        └─► Deploy workflow (VM #2) — corre en paralelo
              configure-aws-credentials
              ecr-login
              docker build
                └─ Stage builder: instala deps + genera índice FAISS
                   (llama a Google Embedding API con la key via BuildKit secret)
                └─ Stage runtime: imagen Lambda limpia + copia el índice
              docker push → ECR (tags: latest + git sha)
              aws lambda update-function-code --image-uri ...:<sha>
              aws lambda wait function-updated
              ✅ Lambda actualizado en producción
```

Ambos workflows corren en máquinas virtuales separadas que GitHub provisiona, usa, y destruye. **GitHub Actions tiene 2000 minutos/mes gratis** en repos privados — más que suficiente para este proyecto.

---

## Por qué el índice FAISS se buildea dentro del Docker

El índice RAG (FAISS + embeddings) se genera **durante el `docker build`**, no en runtime ni localmente. Esto significa:

- **Zero pasos manuales**: el developer solo hace `git push`
- **Zero latencia en Lambda**: el índice está en el filesystem del contenedor, no se descarga de S3
- **Seguridad**: la API key nunca aparece en las layers de la imagen (BuildKit secret mount)
- **Consistencia**: el índice siempre está sincronizado con el código deployado

Cuando `knowledge_base.json` cambia → hacés `git push` → el nuevo índice se buildea y deploya automáticamente.

---

## Tests

Los tests viven en `tests/test_graph.py`. En el estado actual son básicos. La evolución natural para un proyecto post-inversión sería:

| Test | Qué verifica |
|------|--------------|
| Tests de nodos LangGraph | Cada nodo (`profile_node`, `destination_node`, etc.) retorna el estado correcto |
| Tests de endpoints FastAPI | `/chat`, `/chat/async`, `/chat/status/{job_id}` responden correctamente |
| Tests de servicios | `job_store`, `profile_store`, `rag_store` funcionan con datos de prueba |
| Tests de integración | El pipeline completo con mocks de APIs externas |
