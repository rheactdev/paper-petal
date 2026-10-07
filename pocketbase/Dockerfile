# syntax=docker/dockerfile:1
FROM alpine:3.23 AS download
ARG TARGETARCH
ARG PB_VERSION=0.40.4
WORKDIR /download
RUN apk add --no-cache ca-certificates curl unzip
# Use official binaries for the deployment host and verify release checksums.
RUN set -eu; \
    case "$TARGETARCH" in amd64|arm64) ;; *) echo "Unsupported PocketBase architecture: $TARGETARCH" >&2; exit 1 ;; esac; \
    archive="pocketbase_${PB_VERSION}_linux_${TARGETARCH}.zip"; \
    release="https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}"; \
    curl --fail --silent --show-error --location "$release/$archive" --output "$archive"; \
    curl --fail --silent --show-error --location "$release/checksums.txt" --output checksums.txt; \
    grep " $archive$" checksums.txt > selected-checksum.txt; \
    sha256sum -c selected-checksum.txt; \
    unzip -q "$archive" pocketbase -d /pb

FROM alpine:3.23 AS runtime
RUN apk add --no-cache ca-certificates \
    && addgroup -S -g 1001 pocketbase \
    && adduser -S -D -H -u 1001 -G pocketbase pocketbase \
    && mkdir -p /pb/pb_data /pb/pb_hooks /pb/pb_public \
    && chown -R pocketbase:pocketbase /pb
WORKDIR /pb
COPY --from=download /pb/pocketbase /pb/pocketbase
COPY pocketbase/pb_migrations /pb/pb_migrations
USER pocketbase
EXPOSE 8090
ENTRYPOINT ["/pb/pocketbase"]
CMD ["serve", "--http=0.0.0.0:8090", "--dir=/pb/pb_data", "--migrationsDir=/pb/pb_migrations", "--hooksDir=/pb/pb_hooks", "--publicDir=/pb/pb_public", "--automigrate=false"]
