# Build stage
FROM golang:1.23-alpine AS builder

# Install build dependencies
RUN apk add --no-cache make git nodejs npm wget

# Install pnpm
RUN npm install -g pnpm

WORKDIR /src
COPY . .

# Install gf CLI and build
RUN make build

###############################################################################
#                              FINAL IMAGE
###############################################################################
FROM loads/alpine:3.8

ENV WORKDIR /app

# Copy binary from builder stage
COPY --from=builder /src/bin/linux_amd64/flai $WORKDIR/flai
RUN chmod +x $WORKDIR/flai

###############################################################################
#                                   START
###############################################################################
WORKDIR $WORKDIR
CMD ./flai
