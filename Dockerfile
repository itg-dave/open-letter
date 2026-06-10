FROM oven/bun:1 AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lock* ./
RUN bun install --production --no-frozen-lockfile

# Build the Honker SQLite loadable extension (libhonker_ext.so) from source.
FROM rust:1-bookworm AS honker
ARG HONKER_REF=main
RUN git clone --depth 1 --branch "${HONKER_REF}" https://github.com/russellromney/honker.git /honker \
    && cd /honker \
    && cargo build --release -p honker-extension \
    && cp "$(find target/release -maxdepth 1 -name 'libhonker_ext.so' | head -1)" /libhonker_ext.so

FROM base AS runner
WORKDIR /app

# SQLCipher provides encryption at rest; bun:sqlite loads it via setCustomSQLite.
# Symlink to a stable path so the platform default (/usr/lib/libsqlcipher.so) works
# on both amd64 and arm64.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libsqlcipher0 \
    && ln -sf "$(find /usr/lib -name 'libsqlcipher.so*' | head -1)" /usr/lib/libsqlcipher.so \
    && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY --from=honker /libhonker_ext.so /app/vendor/libhonker_ext.so
COPY . .

RUN mkdir -p /app/data /app/backups

ENV NODE_ENV=production
ENV DATABASE_PATH=/app/data/diaetendeckel.db
ENV HONKER_EXTENSION_PATH=/app/vendor/libhonker_ext.so
EXPOSE 3000

CMD ["sh", "-c", "bun db/setup.js && bun server/index.js"]
