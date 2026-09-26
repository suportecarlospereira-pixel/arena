# ARENA V0.1

**Futebol. Inteligência. Competição.**

MVP web/PWA mobile-first com Next.js, TypeScript, Tailwind, Supabase e deploy alvo na Vercel. Não há aposta em dinheiro, cassino nem saldo apostável; palpites são gratuitos e usados para XP/ranking.

## Arquitetura cloud

- **Web + API:** Next.js App Router / Vercel
- **PostgreSQL, Auth e Storage:** Supabase
- **PWA:** manifest + modo standalone + ícone web
- **SportsProvider:** Mock no MVP, desacoplado para API esportiva futura
- **AIProvider:** Mock no MVP, preparado para OpenAI depois
- **PaymentProvider:** ainda sem cobrança real; planos FREE/PRO/PRO+ modelados no banco

O computador do administrador não precisa executar Node, PostgreSQL, Redis, Docker ou servidor 24/7.

## Funcionalidades incluídas

- Home mobile-first com XP, nível, streak e ranking
- Jogos e página de partida
- Palpite gratuito (resultado + placar)
- Função PostgreSQL transacional `submit_prediction` com fechamento por horário, autenticação e XP idempotente
- Ranking e perfil
- Arena AI com MockAIProvider
- Admin dashboard base
- Cadastro/login Supabase
- Schema completo inicial com RLS, constraints e índices
- PWA manifest
- Health endpoint `/api/health`
- Testes Vitest

## Supabase

O projeto cloud já foi criado e as migrações 001 a 004 já foram aplicadas no ambiente ARENA.

Variáveis de deploy:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
NEXT_PUBLIC_APP_URL=https://seu-projeto.vercel.app
ENABLE_DEMO_MODE=false
CRON_SECRET=...
```

Nunca exponha uma chave service-role/secret no cliente.

## Deploy Vercel

Conecte este repositório GitHub à Vercel. A cada push na branch principal, a Vercel executará build e deploy automaticamente.

## Cloud project

- Supabase project: `ARENA`
- Region: `sa-east-1` (São Paulo)
- Project ref: `jpdjwcxlxvlgqgbresae`
- Public API URL: `https://jpdjwcxlxvlgqgbresae.supabase.co`
- Production architecture: Next.js on Vercel + Supabase Database/Auth.
- No local database, Docker or always-on PC is required.
