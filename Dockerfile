ARG DOTNET_SDK_IMAGE=mcr.microsoft.com/dotnet/sdk:10.0
ARG DOTNET_RUNTIME_IMAGE=mcr.microsoft.com/dotnet/aspnet:10.0
ARG NGINX_IMAGE=nginx:1.27-alpine

# The admin panel is a standalone Vite SPA.
FROM node:22-bookworm-slim AS admin-build
ARG APP_BASE_PATH=/admin/
ENV APP_BASE_PATH=${APP_BASE_PATH}
WORKDIR /app

COPY admin/package*.json ./admin/
RUN npm install --prefix admin --no-audit --no-fund
COPY admin ./admin
RUN npm run build --prefix admin

# ---------------------------------------------------------
# FIX: Re-declare the ARG here so the stage can see it
# ---------------------------------------------------------
ARG NGINX_IMAGE=nginx:1.27-alpine

FROM ${NGINX_IMAGE} AS admin-runtime
COPY admin/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=admin-build /app/admin/dist /usr/share/nginx/html/admin

EXPOSE 80

FROM ${DOTNET_SDK_IMAGE} AS backend-build
WORKDIR /app
COPY backend/Kinochy.Api.csproj ./backend/
RUN dotnet restore backend/Kinochy.Api.csproj
COPY backend ./backend
RUN dotnet publish backend/Kinochy.Api.csproj -c Release -o /publish --no-restore

FROM ${DOTNET_RUNTIME_IMAGE} AS runtime
WORKDIR /app
COPY --from=backend-build /publish ./

RUN mkdir -p storage/uploads

EXPOSE 4000
ENV ASPNETCORE_URLS=http://0.0.0.0:4000
ENTRYPOINT ["dotnet", "Kinochy.Api.dll"]