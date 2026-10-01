# ✦ Galaxy Health

Ficha de treino pessoal para quem treina com **elásticos (superband)** e faz alongamentos ao longo do
dia. Mesmo visual e mesma arquitetura do Galaxy Cards: dados num Postgres (Neon), acesso por código,
publicado na Vercel.

**Para instalar e publicar: [SETUP.md](./SETUP.md).**

---

## O que ele faz

**Carga de elástico de verdade.** Elástico não tem peso exato, então a carga de cada série é a
combinação de:

- **elásticos** (um ou mais, por cor, com a faixa em kg que a marca informa);
- **como você ajustou a carga, em texto livre**, sem lista pré-definida: “nó a 10 cm da ponta + pés dois
  palmos além do ombro”, “barriga maior entre as pernas”. O campo sugere os textos que você já usou
  naquele exercício;
- **ajuste estimado (%)**, opcional, para o ajuste entrar na conta da carga;
- **peso livre** opcional (halter, mochila).

Disso sai uma **carga estimada** (ponto médio da faixa × ajuste %). Não é o peso real, e sim uma régua
consistente para comparar uma semana com a outra. Para os recordes, a “mesma carga” é a mesma
combinação de elásticos com o mesmo texto de ajuste (ignorando maiúsculas e espaços).

**Exercícios.** Força, alongamento, mobilidade, peso do corpo e cardio, contados em repetições ou em
tempo, com opção de contagem por lado. Cada um tem “como fazer”, observações, vários links de vídeo
(com miniatura do YouTube), séries, reps e descanso padrão, e carga padrão.

**Treinos (fichas).** A, B, C… com os exercícios em ordem, a meta de séries, a faixa de reps (8–12)
ou o tempo, o descanso, bi-sets e a carga inicial. Dá para duplicar um treino.

**Programa.** Dois modos:
- **Dias da semana:** cada dia recebe um ou mais treinos, com “repetir em…” para copiar um dia para
  outro.
- **Sequência livre:** A B C A B, montada pelas siglas. O próximo só avança quando você conclui o
  treino da vez, então um dia pulado continua esperando.

**Sessão de treino.**
- **Última vez**, em destaque: elásticos, o ajuste que você escreveu e as reps de cada série, mais as observações.
- Cada série já vem com a carga da última vez. Você digita as reps (ou o tempo) e marca ✓.
- **Timer de descanso** automático ao marcar a série, com +15s e “Pronto”. **Timer de isometria**
  para exercícios por tempo.
- **Observação por série**, **observação do exercício no dia** e observação geral do treino, além de
  esforço (1–10), energia (1–5) e dor.
- **Recorde:** aviso de maior carga já usada ou de mais reps com a mesma carga.
- **Sugestão de progressão:** bater o topo da faixa duas vezes seguidas sugere subir o elástico, o
  ajuste (amarra, posição dos pés).
- Pular exercício, adicionar exercício fora da ficha e adicionar ou apagar séries.
- Tudo grava na hora, série a série. O cronômetro é salvo a cada 15 s.

**Comparativo.** Ao concluir, e no Histórico, o treino aparece lado a lado com a **última vez do
mesmo treino**:
- setas de carga, reps, volume, tempo e séries;
- exercícios que você **deixou de fazer** ou que entraram;
- totais do treino.

**Alongamento rápido.** Um toque na tela Hoje registra um alongamento avulso feito ao longo do dia,
com timer opcional.

**Histórico.**
- Mapa de calor de 18 semanas.
- O dia escolhido com os comparativos.
- Últimos treinos.
- **Peso e medidas** com gráfico.

**Evolução por exercício:**
- gráfico de carga máxima, melhor série, reps totais ou volume;
- recordes por combinação de carga;
- histórico série a série.

**Seus dados.** Exporta as séries em CSV (abre no Excel em português) e faz backup completo em JSON.

**App no celular (PWA).** Instalável na tela inicial, com barra de abas no rodapé.

---

## Segurança

Igual ao Galaxy Cards, com duas melhorias:

- O código de acesso fica só como hash **bcrypt** numa variável de ambiente.
- Ao entrar, o servidor emite um JWT num cookie `HttpOnly`, `SameSite=Lax` e `Secure`. O cookie
  vale **180 dias** e se **renova sozinho** a cada visita, então quem usa sempre nunca precisa
  digitar o código de novo.
- Toda rota `/api` (menos o login) exige sessão válida.
- O limite de tentativas é de 8 erradas por IP a cada 15 minutos, **guardado no banco**. Em memória,
  como no Galaxy Cards, cada instância serverless da Vercel teria o próprio contador.

---

## Arquitetura

```
server/
  app.ts               app Express (dev, produção e serverless)
  db/schema.ts         tabelas: bands, exercises, workouts, workout_items,
                       program, sessions, session_exercises, sets, checkins, body_metrics,
                       login_attempts
  db/index.ts          Neon em produção · PGlite (Postgres embutido) no dev
  lib/sessionData.ts   última vez, sugestão de progressão, comparativo, recordes
  routes/              auth · catalog · exercises · workouts · sessions · stats · log · export
shared/load.ts         cálculo da carga estimada (usado no servidor e no navegador)
api/index.ts           entrada serverless da Vercel
src/components/        TodayView · SessionScreen · WorkoutsView · ExercisesView ·
                       HistoryView · SettingsView · ComparisonView · Load · LineChart
scripts/test-api.ts    teste ponta a ponta contra um banco em memória
```

**Stack:** React 19 · Vite · Tailwind v4 · Express 5 · Drizzle ORM · Neon Postgres.

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run dev` | API + front em http://localhost:5173 |
| `npm test` | testa a API inteira contra um Postgres em memória |
| `npm run passcode -- "código"` | gera `PASSCODE_HASH` e `SESSION_SECRET` |
| `npm run db:migrate` | cria as tabelas no Neon |
| `npm run db:generate` | gera migração depois de mudar `schema.ts` |
| `npm run icons` | regera os ícones do app |
