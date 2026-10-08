# syntax=docker/dockerfile:1
# Build context: ./backend (needs BuildingBlocks + shared build props)

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY global.json Directory.Build.props ./
COPY src/BuildingBlocks/ServiceDefaults/ServiceDefaults.csproj src/BuildingBlocks/ServiceDefaults/
COPY src/Services/Profile/Profile.Api/Profile.Api.csproj src/Services/Profile/Profile.Api/
RUN dotnet restore src/Services/Profile/Profile.Api/Profile.Api.csproj
COPY src/ src/
RUN dotnet publish src/Services/Profile/Profile.Api/Profile.Api.csproj -c Release -o /app --no-restore /p:UseAppHost=false

# Alpine runtime: smaller image and attack surface (the app uses invariant globalization).
FROM mcr.microsoft.com/dotnet/aspnet:10.0-alpine AS runtime
WORKDIR /app
ENV ASPNETCORE_HTTP_PORTS=8080 \
    DOTNET_gcServer=0
EXPOSE 8080
COPY --from=build /app .
# Built-in non-root user shipped with the .NET images.
USER $APP_UID
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/health/live || exit 1
ENTRYPOINT ["dotnet", "Profile.Api.dll"]
