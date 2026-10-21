# Admin panel: standalone Vite SPA served by nginx
# Build context is the repository root: docker-compose uses context "." with dockerfile: admin/Dockerfile
ARG NGINX_IMAGE=nginx:1.27-alpine

FROM node:22-bookworm-slim AS build
ARG APP_BASE_PATH=/admin/
ENV APP_BASE_PATH=${APP_BASE_PATH}
WORKDIR /app

COPY admin/package*.json ./admin/
RUN npm install --prefix admin --no-audit --no-fund
COPY admin ./admin
RUN npm run build --prefix admin

FROM ${NGINX_IMAGE} AS runtime
# The admin container only serves the SPA; the edge gateway (repo-root
# nginx.conf, mounted into the separate `nginx` service) does the routing.
COPY admin/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/admin/dist /usr/share/nginx/html

EXPOSE 80
