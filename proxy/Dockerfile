FROM nginx:alpine

ARG VERSION=dev
LABEL org.opencontainers.image.title="ZimaMOD Proxy" \
      org.opencontainers.image.version="$VERSION" \
      org.opencontainers.image.source="https://github.com/metisro/ZimaMOD"

COPY proxy/nginx.conf /etc/nginx/nginx.conf.template
COPY proxy/entrypoint.sh /entrypoint.sh
COPY runtime /runtime
COPY assets/zimamod-icon.png /runtime/zimamod-icon.png

RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
