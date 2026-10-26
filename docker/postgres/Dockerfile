# PostgreSQL 17 with the zhparser Chinese full-text search parser and pgvector (both required by message search).
FROM postgres:17

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl build-essential git postgresql-server-dev-17 postgresql-17-pgvector; \
    curl -fsSL http://www.xunsearch.com/scws/down/scws-1.2.3.tar.bz2 | tar xj -C /tmp; \
    cd /tmp/scws-1.2.3 && ./configure && make -j"$(nproc)" && make install; \
    git clone --depth 1 https://github.com/amutu/zhparser.git /tmp/zhparser; \
    cd /tmp/zhparser && make && make install; \
    apt-get purge -y build-essential git postgresql-server-dev-17 curl; \
    apt-get autoremove -y; \
    rm -rf /var/lib/apt/lists/* /tmp/scws-1.2.3 /tmp/zhparser

COPY init-zhparser.sql /docker-entrypoint-initdb.d/
