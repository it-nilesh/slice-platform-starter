# syntax=docker/dockerfile:1
# One Dockerfile for every app in the workspace. Build context: ./frontend
#   docker build --build-arg APP=mfe-catalog --build-arg PUBLIC_PATH=/mfe/catalog --build-arg NGINX_CONF=remote.conf .

ARG NODE_IMAGE=node:24-alpine
ARG NGINX_IMAGE=nginxinc/nginx-unprivileged:1.29-alpine

FROM ${NODE_IMAGE} AS build
ARG APP
WORKDIR /src
# Manifests first so the dependency layer is cached until a package.json changes.
# --parents keeps the directory layout, so new apps need no Dockerfile change.
COPY package.json package-lock.json tsconfig.base.json ./
COPY --parents packages/*/package.json apps/*/package.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY packages/ packages/
COPY apps/${APP}/ apps/${APP}/
RUN test -n "${APP}" || (echo 'APP build-arg is required' && exit 1)
RUN npm run build -w ${APP}

FROM ${NGINX_IMAGE} AS runtime
ARG APP
ARG PUBLIC_PATH=/
ARG NGINX_CONF=shell.conf
COPY nginx/${NGINX_CONF} /etc/nginx/conf.d/default.conf
COPY --from=build /src/apps/${APP}/dist /usr/share/nginx/html${PUBLIC_PATH}
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
