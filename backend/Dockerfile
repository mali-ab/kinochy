# ASP.NET Core backend API (Kinochy.Api)
# Build context is the repository root: docker-compose uses context "." with dockerfile: backend/Dockerfile
ARG DOTNET_SDK_IMAGE=mcr.microsoft.com/dotnet/sdk:10.0
ARG DOTNET_RUNTIME_IMAGE=mcr.microsoft.com/dotnet/aspnet:10.0

FROM ${DOTNET_SDK_IMAGE} AS build
WORKDIR /app
COPY backend/Kinochy.Api.csproj ./backend/
RUN dotnet restore backend/Kinochy.Api.csproj
COPY backend ./backend
RUN dotnet publish backend/Kinochy.Api.csproj -c Release -o /publish --no-restore

FROM ${DOTNET_RUNTIME_IMAGE} AS runtime
WORKDIR /app
COPY --from=build /publish ./

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -r /var/lib/apt/lists/*

RUN mkdir -p storage/uploads

EXPOSE 4000
ENV ASPNETCORE_URLS=http://0.0.0.0:4000
ENTRYPOINT ["dotnet", "Kinochy.Api.dll"]
