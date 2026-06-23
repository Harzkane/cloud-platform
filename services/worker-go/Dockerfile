# ── Build stage ───────────────────────────────────────────
FROM golang:1.22-alpine AS builder

WORKDIR /app

# Install git (needed for go mod download with private deps)
RUN apk add --no-cache git

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-w -s" \
    -o /bin/worker \
    ./cmd/worker/main.go

# ── Runtime stage ─────────────────────────────────────────
FROM alpine:3.19

# Install runtime dependencies
RUN apk add --no-cache \
    docker-cli \
    git \
    ca-certificates \
    tzdata

WORKDIR /app

COPY --from=builder /bin/worker .

# Create work directory for build artifacts
RUN mkdir -p /tmp/nexgenhost/builds

# Run as non-root
RUN addgroup -S nexgen && adduser -S nexgen -G nexgen
# Worker needs docker socket access
RUN addgroup nexgen docker 2>/dev/null || true

USER nexgen

ENTRYPOINT ["./worker"]
