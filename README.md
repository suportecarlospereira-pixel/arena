# ARENA

**Futebol. Inteligência. Competição.**

ARENA é uma plataforma web/PWA mobile-first de palpites esportivos gratuitos, comunidade e gamificação. Não há aposta em dinheiro real, cassino, carteira apostável ou saldo financeiro.

## Produção

- **App:** Next.js App Router + TypeScript + Tailwind na Vercel
- **Banco/Auth:** Supabase PostgreSQL + Auth + RLS
- **Região do banco:** São Paulo
- **Sports data:** sincronização cloud com ESPN para competições suportadas
- **Automação:** pg_cron + pg_net no Supabase
- **Push:** Web Push com Edge Function Supabase + VAPID em Vault
- **PWA:** manifest, service worker, offline shell e push
- **CI:** GitHub Actions com audit, typecheck, testes e build
- **Administração:** 100% pelo navegador; nenhum servidor local é necessário

Produção atual:

`https://arena-u7qy.vercel.app`

## Recursos principais

### Futebol real e palpites

- agenda real sincronizada automaticamente
- Brasileirão Série A e Série B
- Copa do Brasil
- Libertadores
- Sul-Americana
- escudos, horários, status e placar
- palpites gratuitos de resultado e placar
- fechamento automático no início da partida
- rate limit server-side
- histórico de palpites

### Integridade de resultados

Um placar final não é liquidado assim que aparece pela primeira vez. A modelagem também está preparada para observações de múltiplos providers; em produção, a ESPN é a fonte ativa atual.

A camada de produção registra observações da fonte, exige confirmações repetidas e estabilidade do placar final antes da liquidação. Divergências posteriores bloqueiam a partida e encaminham o caso para revisão administrativa.

Principais campos de integridade:

- `result_confirmation_count`
- `result_confirmed_at`
- `result_disputed`
- `result_locked`
- `result_revision`

O painel `/admin/review` permite ao SUPER_ADMIN resolver uma divergência e travar o placar oficial.

### XP e gamificação

- +5 XP pela primeira participação em uma partida
- +20 XP por acertar vencedor/empate
- +100 XP adicionais por placar exato
- liquidação idempotente
- reconciliação por revisão se o resultado oficial mudar
- níveis
- streak
- escudos de streak
- conquistas
- títulos equipáveis
- desafios diários e semanais
- referrals com recompensa
- rankings global, semanal, mensal, temporada, estado e cidade
- ranking específico por competição

### Comunidade

- perfil público em `/u/username`
- bio e time favorito
- seguir jogadores
- feed de atividade
- comparação entre jogadores
- ligas privadas com código de convite
- ranking por liga
- calendário personalizado do time favorito

O feed não expõe a escolha de um palpite antes do jogo. A atividade registra apenas a existência do palpite, preservando a justiça competitiva.

### Notificações

- central interna de notificações
- resultado de palpites
- conquistas e streak
- referrals
- eventos sociais
- lembrete antes de jogo do time favorito se ainda não houver palpite
- Web Push opcional por dispositivo

As chaves VAPID privadas e o segredo interno do dispatcher ficam armazenados no **Supabase Vault** e nunca devem ser colocados no cliente ou no repositório.

### Arena AI

A Arena AI atual usa inteligência orientada aos dados do próprio ARENA. Ela consulta:

- desempenho do usuário
- XP, precisão, acertos e placares exatos
- ranking
- time favorito
- forma recente disponível no banco
- próximos jogos
- clubes mencionados na pergunta

Ela não inventa estatísticas ausentes.

A camada atual é database-first e não depende de um modelo LLM externo para funcionar.

### Administração

Rotas principais:

- `/admin` — dashboard
- `/admin/users` — usuários, roles e planos
- `/admin/matches` — operação de partidas
- `/admin/review` — revisão de resultados
- `/admin/gamification` — desafios e conquistas
- `/admin/notifications` — comunicação
- `/admin/audit` — auditoria
- `/admin/system` — saúde operacional

RBAC:

- USER
- MODERATOR
- ADMIN
- SUPER_ADMIN

Alterações privilegiadas são validadas no banco e registradas em auditoria.


## Monetização

O núcleo de palpites permanece gratuito e a assinatura não altera a pontuação de um acerto.

Planos atuais:

| Plano | Preço mensal | Arena AI | Ligas criadas | Estatísticas avançadas |
| --- | ---: | ---: | ---: | --- |
| FREE | R$ 0,00 | 5/dia | 1 | Não |
| PRO | R$ 19,90 | 50/dia | 5 | Sim |
| PRO+ | R$ 39,90 | 200/dia | 20 | Sim |

Os limites são aplicados no **backend/Supabase**, e não apenas escondidos no frontend.

Recursos comerciais atuais:

- `/planos` com comparação e uso atual
- quota diária da Arena AI
- limite de criação de ligas
- `/estatisticas` para PRO/PRO+
- solicitações de mudança de plano
- `/admin/billing` com fila comercial, PRO/PRO+, assinaturas manuais e MRR teórico
- aprovação manual que registra `subscriptions.provider='manual'`
- notificação e auditoria após ativação

A integração Stripe já possui checkout, webhook assinado, Customer Portal, idempotência de eventos e sincronização automática de plano. Ela entra em operação quando as credenciais server-side e os price IDs reais forem configurados; até lá, o fluxo manual permanece como fallback.\n\n### Patrocínios\n\n- campanhas administradas em `/admin/sponsors`\n- slot inicial na Home\n- identificação visual obrigatória como **Patrocinado**\n- visível apenas para usuários FREE elegíveis\n- PRO/PRO+ sem espaço patrocinado\n- métricas de impressão, clique e CTR\n- deduplicação por usuário/campanha/placement/dia\n- sem perfil comportamental de anúncios

## Segurança

- RLS nas tabelas expostas
- operações críticas via RPC
- grants de mínimo privilégio
- roles nunca são definidas por `user_metadata`
- service-role/secret nunca vai para o navegador
- CSP
- HSTS
- X-Frame-Options
- nosniff
- Permissions-Policy
- rate limit de palpites
- trilha de auditoria
- push secrets criptografados no Vault

O Supabase Auth ainda deve ter **Leaked Password Protection** habilitado no Dashboard antes de uma abertura pública ampla.

## Banco e migrações

As migrações estão em `supabase/migrations/`.

A sequência atual inclui:

- 001 — schema inicial
- 002 — segurança e ranking público
- 003 — índices de FKs
- 004 — dashboard administrativo
- 005 — sincronização esportiva real
- 006 — hardening de produção, revisão e liquidação
- 007 — mínimo privilégio e integridade
- 008 — comunidade, ligas e retenção
- 009 — Web Push
- 010 — escudo de streak no fluxo de palpite\n- 011 — limites temporais corretos no ranking de ligas\n- 012 — entitlements e quotas de monetização\n- 013 — operação manual de billing\n- 014 — helpers internos de autorização/auditoria do billing\n- 015 — campanhas patrocinadas e métricas\n- 016 — billing provider-ready e sincronização Stripe\n- 017 — helper de checkout para cliente Stripe

A Edge Function de push está versionada em:

`supabase/functions/arena-push/`

Os valores secretos do Vault são provisionados diretamente no ambiente de produção e **não** fazem parte das migrações Git.

## Jobs cloud

O Supabase executa automaticamente tarefas como:

- atualização frequente de jogos
- processamento das respostas esportivas
- confirmação/liquidação dos resultados
- criação de desafios recorrentes
- limpeza de observações antigas
- lembretes do time favorito

O computador do administrador pode ficar desligado.

## CI

Cada push no `main` executa:

1. `npm ci`
2. `npm audit --audit-level=high`
3. TypeScript typecheck
4. testes Vitest
5. `next build`

Uma mudança não deve ser considerada pronta se esse pipeline não estiver verde.

## Variáveis públicas

O app usa:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
NEXT_PUBLIC_APP_URL=https://arena-u7qy.vercel.app
```

Nunca exponha chaves `service_role`, `sb_secret_...`, VAPID private key ou o segredo do push no navegador, GitHub ou variáveis `NEXT_PUBLIC_*`.

## Observações de produto

O ARENA atual é uma plataforma de **palpites gratuitos e competição esportiva**. Qualquer evolução futura para aposta com dinheiro real exige uma arquitetura separada de conformidade, autorização regulatória, KYC/AML, pagamentos, jogo responsável, auditoria financeira e controles específicos.
