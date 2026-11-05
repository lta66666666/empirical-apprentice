FROM node:24.14.0-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3.11 python3.11-venv ca-certificates \
    && rm -rf /var/lib/apt/lists/* && python3.11 -m venv /opt/venv
WORKDIR /app
COPY deploy/joycode/requirements-linux.txt /app/deploy/joycode/requirements-linux.txt
RUN /opt/venv/bin/pip install --no-cache-dir -r deploy/joycode/requirements-linux.txt
COPY worker ./worker
COPY static ./static
COPY scripts ./scripts
COPY vendor ./vendor
COPY drizzle ./drizzle
COPY standalone ./standalone
COPY executor ./executor
COPY .openai/hosting.json ./.openai/hosting.json
COPY package.json ./package.json
COPY deploy/joycode ./deploy/joycode
RUN node scripts/build-prototype.mjs && cp deploy/joycode/start.sh /bin/start.sh \
    && sed -i 's/\r$//' /bin/start.sh && chmod 755 /bin/start.sh \
    && mkdir -p /data/web /data/executor && chown -R node:node /data
USER node
ENV PATH=/opt/venv/bin:$PATH PORT=8080 BIND_ADDRESS=0.0.0.0 \
    EA_DATA_DIR=/data/web EA_NODE_DATA=/data/executor NODE_ENV=production
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
EXPOSE 8080
CMD ["/bin/start.sh"]
