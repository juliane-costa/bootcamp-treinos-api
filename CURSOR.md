# CURSOR.md

Este arquivo orienta o Cursor ao trabalhar com o codigo deste repositorio.

## Visao Geral

API de treinos construida com Fastify 5, TypeScript, Prisma 7 e Better-Auth. Roda em Node.js 24.x com pnpm 10.30.3 (ambos obrigatorios via `engine-strict`).

## Comandos

```bash
# Iniciar PostgreSQL
docker-compose up -d

# Iniciar servidor de desenvolvimento (hot-reload na porta 3000)
pnpm dev

# Migrations do Prisma
pnpm exec prisma migrate dev
pnpm exec prisma generate

# Lint
pnpm exec eslint .

# Formatacao
pnpm exec prettier --write .
```

Nao ha script de build ou teste configurado ainda. TypeScript compila para `./dist` via `tsc`.

## Arquitetura

### Padrao em camadas: Routes → Use Cases → Prisma

- **Routes** (`src/routes/`) — Handlers de rotas Fastify. Registram schemas Zod para validacao de request/response via `fastify-type-provider-zod`. Extraem sessao de autenticacao e definem status HTTP.
- **Use Cases** (`src/usecases/`) — Classes de logica de negocio. Recebem DTOs, usam transacoes Prisma para atomicidade (ex: desativar planos ativos antes de criar novos). Uma classe por caso de uso, com metodo `execute(dto)`.
- **Schemas** (`src/schemas/`) — Schemas Zod compartilhados entre rotas e OpenAPI docs. Definem tanto validacao de entrada quanto formato de resposta.
- **Errors** (`src/errors/`) — Classes de erro customizadas (ex: `NotFoundError`) usadas nos use cases e tratadas nas rotas.

### Estrutura de pastas

```
src/
├── index.ts              # Setup do Fastify, registro de plugins, start do servidor
├── routes/               # Um arquivo por recurso (ex: workout-plan.ts)
├── usecases/             # Uma classe por caso de uso (ex: CreateWorkoutPlan.ts)
├── schemas/              # Schemas Zod para validacao e OpenAPI
├── errors/               # Classes de erro customizadas
├── lib/                  # Utilitarios compartilhados (db client, auth config)
└── generated/prisma/     # Prisma client gerado automaticamente (NAO editar)
```

### Autenticacao

Better-Auth com adaptador Prisma (`src/lib/auth.ts`). Rotas de auth em `/api/auth/*`. Autenticacao baseada em sessao — rotas extraem a sessao do usuario via `auth.api.getSession()`.

### Banco de Dados

PostgreSQL 16 via Docker. Prisma client inicializado em `src/lib/db.ts` com `@prisma/adapter-pg`. Tipos gerados em `src/generated/prisma/` (gitignored). Schema em `prisma/schema.prisma`, config em `prisma.config.ts`.

### Documentacao da API

Swagger JSON em `/swagger.json`, Scalar UI em `/docs`. Endpoints de auth sao mesclados no spec OpenAPI via plugin do Better-Auth.

## Convencoes

- **TypeScript strict** com target ES2024 e module resolution `nodenext`
- **ESM only** — todos os imports usam extensao `.js` (ex: `import { prisma } from "../lib/db.js"`)
- **ESLint** com typescript-eslint, integracao com prettier e `simple-import-sort` (imports devem ser ordenados)
- **Zod 4** para validacao
- **CORS** permite `http://localhost:3000` com credentials
- Variaveis de ambiente: `PORT`, `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`

### Nomenclatura

- Arquivos: `kebab-case` para routes/lib/schemas, `PascalCase` para use cases (ex: `CreateWorkoutPlan.ts`)
- Classes: `PascalCase` (ex: `CreateWorkoutPlan`)
- Variaveis/funcoes: `camelCase`
- Prisma models: `PascalCase`. Tabelas usam `@@map("snake_case")` onde aplicavel
- Enums: membros em `UPPER_CASE` (ex: `Weekday.MONDAY`)

### Routes

- Um arquivo por recurso em `src/routes/` (ex: `workout-plan.ts`)
- Exporta funcao async que recebe `FastifyInstance` e registra rotas
- Sempre usar `.withTypeProvider<ZodTypeProvider>()` ao definir rotas
- Definir `schema.body`, `schema.response`, `schema.querystring`/`schema.params` usando schemas de `src/schemas/`
- Rotas autenticadas chamam `auth.api.getSession({ headers: fromNodeHeaders(request.headers) })` e retornam 401 se null
- Registrar arquivos de rota em `src/index.ts` com `app.register(routes, { prefix: "/recurso" })`
- Logica do handler envolta em try/catch; erros conhecidos mapeados para HTTP codes, fallback para 500

### Use Cases

- Uma classe por caso de uso em `src/usecases/`, nomeada com verbo de acao (ex: `CreateWorkoutPlan`, `ListWorkoutPlans`)
- Interface `InputDto` no topo do arquivo descrevendo a entrada esperada
- Metodo publico unico: `async execute(dto: InputDto)`
- Usar `prisma.$transaction()` para escritas multiplas que precisam ser atomicas
- Lancar erros customizados (ex: `NotFoundError`) para violacoes de regras de negocio

### Schemas (Zod)

- Todos os schemas Zod ficam em `src/schemas/index.ts`
- Reutilizados para validacao de request e documentacao OpenAPI
- Usar `.omit()` / `.pick()` / `.partial()` para derivar variantes (ex: `WorkoutPlanSchema.omit({ id: true })` para input de criacao)
- Enums do Prisma importados de `src/generated/prisma/enums.js` e usados com `z.enum()`
- `ErrorSchema` (`{ message, code }`) compartilhado em todas as respostas de erro

### API

- Endpoints RESTful: `POST /recurso` (criar), `GET /recurso` (listar), `GET /recurso/:id` (detalhe), `PUT /recurso/:id` (atualizar), `DELETE /recurso/:id` (deletar)
- Status codes: `200` (sucesso), `201` (criado), `400` (validacao), `401` (nao autorizado), `404` (nao encontrado), `500` (erro interno)
- Todas as respostas de erro seguem o formato `{ message: string, code: string }`
- Prefixos de rotas sao substantivos plurais em `kebab-case` (ex: `/workout-plans`)

### Banco de Dados

- Todos os timestamps usam `@db.Timestamptz()`
- Cascade deletes de pai para filhos
- Apos editar o schema: `pnpm exec prisma migrate dev --name <descricao>` e `pnpm exec prisma generate`
- Arquivos em `src/generated/prisma/` nunca devem ser editados manualmente

### Nova Feature (Checklist)

1. **Schema Prisma** — Se o modelo e novo, atualizar `prisma/schema.prisma`, rodar migrate e generate
2. **Schema Zod** — Adicionar ou atualizar schemas em `src/schemas/index.ts`
3. **Use Case** — Criar nova classe em `src/usecases/` com `InputDto` e `execute()`
4. **Errors** — Adicionar classes de erro customizadas em `src/errors/index.ts` se necessario
5. **Route** — Criar ou atualizar arquivo de rota em `src/routes/`, configurar auth, validacao e use case
6. **Registrar** — Se for arquivo de rota novo, registrar em `src/index.ts` com o prefixo adequado
