# Version checks deliberately fail if this image/tag or packages drift.
FROM rocker/r-ver:4.6.1
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates && rm -rf /var/lib/apt/lists/*
RUN Rscript -e "install.packages('remotes', repos='https://cloud.r-project.org'); remotes::install_version('fixest', version='0.14.2', repos='https://cloud.r-project.org'); remotes::install_version('jsonlite', version='2.0.0', repos='https://cloud.r-project.org')"
WORKDIR /app
COPY requirements.txt /app/requirements.txt
RUN python3 -m venv /opt/venv && /opt/venv/bin/pip install --no-cache-dir -r requirements.txt
COPY . /app/executor
RUN useradd -m -u 10001 executor && mkdir /data && chown executor:executor /data
ENV EA_NODE_DATA=/data
USER executor
EXPOSE 8000
CMD ["/opt/venv/bin/uvicorn", "executor.app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
