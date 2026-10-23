# syntax=docker/dockerfile:1
# Recipe Box API — multi-stage build (amd64 + arm64).
#
# The builder always runs on the build machine's own architecture and cross-compiles for the target, so an arm64
# image built on an amd64 CI runner takes minutes instead of the hour-plus QEMU emulation needs.

FROM --platform=$BUILDPLATFORM rust:1-bookworm AS builder
ARG TARGETARCH
ARG BUILDARCH
# Map Docker's arch name to the Rust target and the matching gcc triple (used as linker and C compiler for
# ring / aws-lc-sys). Cross packages are only installed when target and build arch differ.
RUN set -eux; \
    case "$TARGETARCH" in \
      amd64) target=x86_64-unknown-linux-gnu;  gcc=x86_64-linux-gnu;  pkg=x86-64-linux-gnu ;; \
      arm64) target=aarch64-unknown-linux-gnu; gcc=aarch64-linux-gnu; pkg=aarch64-linux-gnu ;; \
      *) echo "unsupported TARGETARCH: $TARGETARCH" >&2; exit 1 ;; \
    esac; \
    if [ "$TARGETARCH" != "$BUILDARCH" ]; then \
      apt-get update; \
      apt-get install -y --no-install-recommends "gcc-$pkg" "libc6-dev-$TARGETARCH-cross"; \
      rm -rf /var/lib/apt/lists/*; \
    fi; \
    rustup target add "$target"; \
    printf 'export CARGO_BUILD_TARGET=%s\n' "$target" > /env.sh; \
    t=$(echo "$target" | tr 'a-z-' 'A-Z_'); u=$(echo "$target" | tr '-' '_'); \
    printf 'export CARGO_TARGET_%s_LINKER=%s-gcc CC_%s=%s-gcc AR_%s=%s-ar\n' "$t" "$gcc" "$u" "$gcc" "$u" "$gcc" >> /env.sh
WORKDIR /app
# Dependency layer: build against dummy sources so it stays cached until Cargo.toml/Cargo.lock change.
COPY Cargo.toml Cargo.lock ./
RUN . /env.sh \
    && mkdir src benches && echo 'fn main() {}' > src/main.rs && touch src/lib.rs \
    && echo 'fn main() {}' > benches/search.rs \
    && cargo build --release --locked \
    && rm -rf src
COPY migrations migrations
COPY src src
# COPY keeps the context's mtimes, which can be older than the dummy build; touch so cargo rebuilds our crate.
RUN . /env.sh \
    && touch src/main.rs src/lib.rs \
    && cargo build --release --locked \
    && cp "target/$CARGO_BUILD_TARGET/release/recipe-box-api" /recipe-box-api

FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl libheif-examples \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --user-group --home-dir /nonexistent --shell /usr/sbin/nologin app \
    && mkdir -p /data/media \
    && chown app:app /data/media
COPY --from=builder /recipe-box-api /usr/local/bin/recipe-box-api
USER app
ENV BIND_ADDR=0.0.0.0:8080 \
    MEDIA_DIR=/data/media \
    RUST_LOG=info
VOLUME /data/media
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
    CMD curl -fsS http://127.0.0.1:8080/api/health > /dev/null || exit 1
CMD ["recipe-box-api"]
