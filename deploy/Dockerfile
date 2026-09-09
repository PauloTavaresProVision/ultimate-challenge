FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY app ./app
COPY components ./components
COPY hooks ./hooks
COPY lib ./lib
COPY public ./public
COPY production ./production
COPY vite.production.config.ts tsconfig.json ./
RUN npx vite build --config vite.production.config.ts
COPY server/package.json server/package-lock.json ./server/
WORKDIR /app/server
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN npm ci
COPY server/prisma ./prisma
COPY server/prisma.config.ts ./
COPY server/src ./src
COPY server/tsconfig.json ./
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN DATABASE_URL=postgresql://build:build@localhost/escada npm run db:generate
RUN npm run check

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates chromium && rm -rf /var/lib/apt/lists/*
WORKDIR /app/server
COPY --from=build --chown=node:node /app/server ./
COPY --from=build --chown=node:node /app/lib /app/lib
RUN mkdir -p /app/server/.session /app/server/.web-session && chown node:node /app/server/.session /app/server/.web-session
USER node
EXPOSE 3100
CMD ["sh", "-c", "npm run db:migrate && exec node --import tsx src/index.ts"]
