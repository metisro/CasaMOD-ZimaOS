FROM node:22-alpine

ARG VERSION=dev
ENV VERSION=$VERSION
LABEL org.opencontainers.image.title="ZimaMOD API" \
      org.opencontainers.image.version="$VERSION" \
      org.opencontainers.image.source="https://github.com/metisro/ZimaMOD"

COPY api/server.js /app/server.js
COPY api/entrypoint.sh /app/entrypoint.sh
COPY mods /bundled-mods

RUN chmod +x /app/entrypoint.sh

WORKDIR /app

ENTRYPOINT ["/app/entrypoint.sh"]
