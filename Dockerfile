FROM node:24.14.0-bookworm-slim
ARG IMAGE_TAG=dev
LABEL org.opencontainers.image.revision=$IMAGE_TAG
# 构建加速：Debian 源切换到腾讯云镜像（境内实测 45 MB/s，官方源仅约 15 kB/s）
RUN for f in /etc/apt/sources.list /etc/apt/sources.list.d/debian.sources; do \
      if [ -f "$f" ]; then sed -i 's|deb.debian.org|mirrors.tencent.com|g' "$f"; fi; \
    done \
    && apt-get update && apt-get install -y --no-install-recommends python3.11 python3.11-venv ca-certificates \
    && rm -rf /var/lib/apt/lists/* && python3.11 -m venv /opt/venv
ENV PATH=/opt/venv/bin:$PATH
WORKDIR /app
# 国内构建加速：PyPI 走清华镜像；statspai 固定提交源码包预置在 vendor/（48MB，按 sha256 校验，不入库）
ENV PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple PIP_DEFAULT_TIMEOUT=60
COPY vendor/statspai-9f12d999d23a5bc2f2fa5fca38fe498aeea38752.zip /app/vendor/
COPY deploy/joycode/requirements-linux.txt /app/deploy/joycode/requirements-linux.txt
RUN echo "d4c8c0d3a437bb3e46e7ca9c74324bbc54bf16deaa55d14c43a0cd321a74460c  /app/vendor/statspai-9f12d999d23a5bc2f2fa5fca38fe498aeea38752.zip" | sha256sum -c - \
    && /opt/venv/bin/pip install --no-cache-dir -r deploy/joycode/requirements-linux.txt
COPY worker ./worker
COPY static ./static
COPY scripts ./scripts
COPY vendor ./vendor
COPY drizzle ./drizzle
COPY standalone ./standalone
COPY executor ./executor
COPY .openai/hosting.json ./.openai/hosting.json
COPY package.json ./package.json
COPY README.md ./README.md
COPY Dockerfile ./Dockerfile
COPY deploy/joycode ./deploy/joycode
RUN mkdir -p docs outputs && node scripts/build-prototype.mjs && node scripts/ci-check.mjs && cp deploy/joycode/start.sh /bin/start.sh \
    && sed -i 's/\r$//' /bin/start.sh && chmod 755 /bin/start.sh \
    && mkdir -p /data/web /data/executor && chown -R node:node /data
USER node
ENV PATH=/opt/venv/bin:$PATH PORT=8080 BIND_ADDRESS=0.0.0.0 \
    EA_DATA_DIR=/data/web EA_NODE_DATA=/data/executor NODE_ENV=production
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
EXPOSE 8080
CMD ["/bin/start.sh"]
