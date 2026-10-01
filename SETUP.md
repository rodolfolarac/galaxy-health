# Galaxy Health — passo a passo

## 1. Rodar no seu computador (sem conta nenhuma)

```bash
cd galaxy-health
npm install
cp .env.example .env
npm run passcode -- "seu-codigo-secreto"
```

Cole as linhas `PASSCODE_HASH` e `SESSION_SECRET` no `.env`. Deixe `DATABASE_URL="pglite"`: o app usa
um Postgres embutido na pasta `.pglite/`, e as tabelas são criadas sozinhas.

```bash
npm run dev
```

Abra **http://localhost:5173** e entre com o código.

---

## 2. Criar o banco online (Neon, grátis)

> ⚠️ **Crie um projeto Neon NOVO. Não use o banco do Galaxy Cards.** Se as tabelas dos dois apps
> ficarem no mesmo banco, um `drizzle-kit push` de um app pode apagar as tabelas do outro.

1. Entre em **https://neon.com**, clique em **New project**, dê o nome `galaxy-health` e escolha a
   região `AWS US East`.
2. Copie a **connection string** (`postgresql://...neon.tech/neondb?sslmode=require`).
3. Crie as tabelas a partir do seu computador:

   ```bash
   DATABASE_URL="postgresql://...cole-aqui..." npm run db:migrate
   ```

---

## 3. Publicar na Vercel

1. Suba o projeto para um repositório **privado** no GitHub.
2. Na Vercel, clique em **Add New → Project**, escolha o repositório e clique em **Import**.
3. Em **Environment Variables**, cadastre:

   | Name | Value |
   | --- | --- |
   | `DATABASE_URL` | a connection string do Neon do passo 2 |
   | `PASSCODE_HASH` | gerado pelo `npm run passcode` |
   | `SESSION_SECRET` | gerado pelo `npm run passcode` |

   Para produção, gere um código **diferente** do que você usou localmente.

4. Clique em **Deploy**. Depois abra a URL no celular e instale o app:
   - **iPhone:** Safari → Compartilhar → *Adicionar à Tela de Início*;
   - **Android:** Chrome → menu → *Instalar app*.

Quem abrir a URL sem o código vê só a tela de acesso.

---

## 4. Primeiros cadastros (ordem sugerida)

1. **Ajustes → Elásticos:** clique em *Carregar cores comuns de superband* e ajuste os kg conforme a
   embalagem dos seus elásticos (ou cadastre do zero).
2. **Exercícios:** cadastre cada exercício, com vídeos, observações e a carga padrão.
3. **Treinos:** monte A, B, C… e, embaixo, o **Programa** (dias da semana ou sequência livre).
4. **Hoje:** clique em *Começar treino*. Em cada série, toque na carga para escolher os elásticos e
   escrever como ajustou (amarra, pés, barriga do elástico…). Na próxima vez, ela já vem preenchida.

## Trocar o código de acesso

Rode `npm run passcode -- "novo-codigo"` e troque `PASSCODE_HASH` e `SESSION_SECRET` na Vercel (e no
`.env`). Trocar o `SESSION_SECRET` desloga todos os aparelhos.

## Mudou o schema?

```bash
npm run db:generate   # cria a migração em drizzle/
DATABASE_URL="postgresql://..." npm run db:migrate
```

No desenvolvimento local (PGlite), as migrações são aplicadas sozinhas ao subir o `npm run dev`.
