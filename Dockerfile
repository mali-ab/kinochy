ARG NODE_IMAGE=node:22-alpine
ARG DOTNET_SDK_IMAGE=mcr.microsoft.com/dotnet/sdk:8.0
ARG DOTNET_RUNTIME_IMAGE=mcr.microsoft.com/dotnet/aspnet:8.0

FROM ${NODE_IMAGE} AS frontend-build
ARG APP_BASE_PATH=/
ENV APP_BASE_PATH=${APP_BASE_PATH}
ENV NEXT_PUBLIC_BASE_PATH=${APP_BASE_PATH}
WORKDIR /app

COPY package*.json ./
COPY frontend/package.json ./frontend/package.json
RUN npm install
COPY frontend/app ./frontend/app
COPY frontend/src ./frontend/src
COPY frontend/public ./frontend/public
COPY frontend/next-env.d.ts frontend/next.config.ts frontend/postcss.config.mjs frontend/tailwind.config.ts frontend/tsconfig.json ./frontend/
RUN npm run build --workspace frontend

FROM ${DOTNET_SDK_IMAGE} AS backend-build
WORKDIR /app
COPY backend/Kinochy.Api.csproj ./backend/
RUN dotnet restore backend/Kinochy.Api.csproj
COPY backend ./backend
COPY --from=frontend-build /app/frontend/out ./backend/wwwroot
RUN dotnet publish backend/Kinochy.Api.csproj -c Release -o /publish --no-restore

FROM ${DOTNET_RUNTIME_IMAGE} AS runtime
WORKDIR /app
COPY --from=backend-build /publish ./

RUN mkdir -p storage/uploads

EXPOSE 4000
ENV ASPNETCORE_URLS=http://0.0.0.0:4000
ENTRYPOINT ["dotnet", "Kinochy.Api.dll"]
