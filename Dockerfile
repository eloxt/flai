# Stage 1: Build frontend with pnpm
FROM node:20-alpine AS frontend-builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /src/frontend
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY frontend/ ./
RUN pnpm run build

###############################################################################
#                         Stage 2: Build backend
###############################################################################
FROM golang:1.24-alpine AS builder

# Install build dependencies
RUN apk add --no-cache make git wget

WORKDIR /src
COPY . .

# Copy frontend build artifacts from stage 1
RUN rm -rf /src/resource/public/*
COPY --from=frontend-builder /src/frontend/build/client/ /src/resource/public/

# Install gf CLI and build backend only
RUN go install github.com/gogf/gf/cmd/gf/v2@latest && gf build -ew

###############################################################################
#                              FINAL IMAGE
###############################################################################
FROM loads/alpine:3.8

ENV WORKDIR /app

# Copy binary from builder stage
COPY --from=builder /src/bin/0.0.1/linux_amd64/flai $WORKDIR/flai
RUN chmod +x $WORKDIR/flai

###############################################################################
#                                   START
###############################################################################
WORKDIR $WORKDIR
CMD ./flai
