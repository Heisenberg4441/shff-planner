# syntax=docker/dockerfile:1

# ============================================================
#  SHFF Planner — один образ на весь сервис.
#  Node собирает интерфейс, а потом сам его и раздаёт: один порт,
#  один том, никаких сайдкаров. Данные живут в /data.
#
#  Образ собирается под amd64 и arm64 (homelab часто живёт на
#  одноплатнике). Чтобы не гонять tsc и vite под эмуляцией,
#  JS собирается на платформе сборщика — он от архитектуры не
#  зависит, — а под целевую ставится только better-sqlite3.
#
#  База — Debian 13 (trixie), и это не вкусовщина. better-sqlite3
#  всегда предпочитает свой готовый бинарь из prebuilds/, а его
#  arm64-сборка требует GLIBC 2.38. В bookworm 2.36 — образ поднимался
#  на amd64 и падал на Raspberry Pi. В trixie 2.41, хватает обоим.
# ============================================================

# ---------- 1. сборка JS: всегда на архитектуре сборщика ----------
FROM --platform=$BUILDPLATFORM node:22-trixie-slim AS build

WORKDIR /app
ENV NODE_ENV=development

COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
# --ignore-scripts: тут нужен только TypeScript и vite, а better-sqlite3
# собирать незачем — в рантайм он приедет из следующего слоя
RUN npm ci --no-audit --no-fund --ignore-scripts

COPY tsconfig.base.json ./
COPY shared ./shared
COPY server ./server
COPY web ./web
COPY _ds ./_ds

RUN npm run build

# ---------- 2. зависимости рантайма: под целевую архитектуру ----------
FROM node:22-trixie-slim AS deps

WORKDIR /app
ENV NODE_ENV=development

# Компилятор нужен не для сборки better-sqlite3 (он приезжает готовым),
# а для того, чтобы npm сумел выполнить его binding.gyp: gyp — это python,
# и он запускается даже когда решает ничего не собирать. Заодно это
# страховка на случай платформы, под которую готового бинаря нет.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN npm ci --omit=dev --no-audit --no-fund

# ---------- 3. рантайм ----------
FROM node:22-trixie-slim AS runtime

ENV NODE_ENV=production \
    SHFF_HOST=0.0.0.0 \
    SHFF_PORT=8787 \
    SHFF_DATA_DIR=/data \
    SHFF_STATIC_DIR=/app/web/dist

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/web/dist ./web/dist
COPY package.json ./package.json

RUN mkdir -p /data && chown -R node:node /data

USER node
VOLUME ["/data"]
EXPOSE 8787

# health-проба без curl: fetch есть в Node из коробки
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.SHFF_PORT||8787)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/dist/server/src/index.js"]

LABEL org.opencontainers.image.title="SHFF Planner" \
      org.opencontainers.image.description="Поминутный планировщик суток. Self-hosted, локальная база, без трекинга." \
      org.opencontainers.image.source="https://github.com/Heisenberg4441/shff-planner" \
      org.opencontainers.image.licenses="MIT"
