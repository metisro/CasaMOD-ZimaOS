FROM node:22-alpine

COPY api/server.js /app/server.js
COPY api/entrypoint.sh /app/entrypoint.sh
COPY mods /bundled-mods

RUN chmod +x /app/entrypoint.sh

WORKDIR /app

ENTRYPOINT ["/app/entrypoint.sh"]
