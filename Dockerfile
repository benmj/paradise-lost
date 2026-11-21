FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
RUN python3 scripts/build.py
ENV HOST=0.0.0.0 PORT=8107 DATA_DIR=/data
VOLUME /data
EXPOSE 8107
CMD ["node", "--disable-warning=ExperimentalWarning", "server.mjs"]
