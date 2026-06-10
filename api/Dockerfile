FROM node:22-alpine

ARG VERSION=dev
ENV VERSION=$VERSION
LABEL org.opencontainers.image.title="ZimaMOD API" \
      org.opencontainers.image.version="$VERSION" \
      org.opencontainers.image.source="https://github.com/metisro/ZimaMOD" \
      org.opencontainers.image.licenses="Apache-2.0"

COPY api/server.js /app/server.js
COPY api/entrypoint.sh /app/entrypoint.sh
COPY mods /bundled-mods
COPY LICENSE THIRD_PARTY_NOTICES.md /licenses/

RUN chmod +x /app/entrypoint.sh

WORKDIR /app

ENTRYPOINT ["/app/entrypoint.sh"]
