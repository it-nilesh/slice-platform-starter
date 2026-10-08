# syntax=docker/dockerfile:1
FROM nginxinc/nginx-unprivileged:1.31-alpine-slim

# Routing (conf.d/default.conf), the allowlist and the MFE manifest are baked in
# for reproducible deploys. allowlist.conf and config/ are also designed to be
# overridden at runtime (Compose bind mount / Kubernetes ConfigMap) so a new
# microfrontend can be registered without rebuilding any image.
COPY conf.d/ /etc/nginx/conf.d/
COPY snippets/ /etc/nginx/snippets/
COPY config/ /usr/share/nginx/config/

EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
