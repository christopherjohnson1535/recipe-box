# Recipe Box API — multi-stage build (amd64 + arm64).

FROM rust:1-bookworm AS builder
WORKDIR /app
# Dependency layer: build against dummy sources so `cargo build` is cached until Cargo.toml/Cargo.lock change.
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo 'fn main() {}' > src/main.rs && touch src/lib.rs \
    && cargo build --release --locked \
    && rm -rf src
COPY migrations migrations
COPY src src
# COPY keeps the context's mtimes, which can be older than the dummy build; touch so cargo rebuilds our crate.
RUN touch src/main.rs src/lib.rs && cargo build --release --locked

FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --user-group --home-dir /nonexistent --shell /usr/sbin/nologin app \
    && mkdir -p /data/media \
    && chown app:app /data/media
COPY --from=builder /app/target/release/recipe-box-api /usr/local/bin/recipe-box-api
USER app
ENV BIND_ADDR=0.0.0.0:8080 \
    MEDIA_DIR=/data/media \
    RUST_LOG=info
VOLUME /data/media
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
    CMD curl -fsS http://127.0.0.1:8080/api/health > /dev/null || exit 1
CMD ["recipe-box-api"]
