FROM python:3.13.13-slim-bookworm@sha256:f576b530293e74140ea91d262232648d5c4f45640a95ec447757701bfcacf034

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      libgnutls30=3.7.9-2+deb12u7 \
      libssl3=3.0.20-1~deb12u2 \
      openssl=3.0.20-1~deb12u2 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.lock ./requirements.lock
RUN python -m pip install --no-cache-dir -r requirements.lock \
    && groupadd --system amoria \
    && useradd --system --gid amoria --home-dir /app amoria \
    && chown -R amoria:amoria /app

COPY --chown=amoria:amoria worker.py ./worker.py

USER amoria

ENTRYPOINT ["python", "/app/worker.py"]
