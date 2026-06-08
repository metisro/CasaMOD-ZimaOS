FROM nginx:alpine

ARG VERSION=dev
LABEL org.opencontainers.image.title="ZimaMOD Proxy" \
      org.opencontainers.image.version="$VERSION" \
      org.opencontainers.image.source="https://github.com/metisro/ZimaMOD"

COPY proxy/nginx.conf /etc/nginx/nginx.conf
COPY runtime /runtime
COPY assets/zimamod-icon.png /runtime/zimamod-icon.png
