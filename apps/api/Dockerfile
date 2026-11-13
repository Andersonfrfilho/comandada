FROM oven/bun:1.3 AS base
WORKDIR /app

# Só as dependências de produção vão para a imagem final.
FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Sem bundle: o Bun roda o TypeScript direto. O bundle quebrava o boot porque os módulos
# @adatechnology/meta-whatsapp-module e scheduling-module acham as próprias migrations por
# import.meta.url — empacotados, os dois passavam a procurar em dist/migrations.
FROM base AS runner
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json bun.lock tsconfig.json drizzle.config.ts ./
COPY drizzle ./drizzle
COPY src ./src

EXPOSE 3333
CMD ["bun", "run", "src/index.ts"]
