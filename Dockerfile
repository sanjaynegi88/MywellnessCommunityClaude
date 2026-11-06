FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
# ffmpeg renders the short videos; fonts are needed to draw text in banners and video frames
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-liberation fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY . .
RUN mkdir -p data/media && chown -R node:node /app
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]
