# syntax=docker/dockerfile:1

ARG NODE_IMAGE=node:22-alpine

# ---------- 1. Dependencies (cached layer) ----------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
# Matches package.json (always) and package-lock.json (when present).
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
  if [ -f package-lock.json ]; then \
    npm ci --no-audit --no-fund; \
  else \
    npm install --no-audit --no-fund; \
  fi

# ---------- 2. Build ----------
FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Only needed if this container must proxy /api and /media itself via Next
# rewrites (NEXT_PUBLIC_* and rewrites are baked at build time).
ARG API_ORIGIN
ENV API_ORIGIN=${API_ORIGIN}
# Optional sub-path deploy; leave empty for "/".
ARG NEXT_PUBLIC_BASE_PATH
ENV NEXT_PUBLIC_BASE_PATH=${NEXT_PUBLIC_BASE_PATH}
ENV APP_BASE_PATH=${NEXT_PUBLIC_BASE_PATH}
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---------- 3. Runtime (minimal standalone) ----------
FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=5173
# node:22-alpine ships an unprivileged "node" user
USER node
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
EXPOSE 5173
CMD ["node", "server.js"]
