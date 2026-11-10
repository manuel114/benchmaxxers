# The whole game in one container: gym server (MCP, live connection, API)
# plus the built gym page. State lives in one SQLite file on a mounted disk.
FROM node:24-slim

RUN npm install -g pnpm@10.32.1
WORKDIR /app

# Install first, from the package files only, so code changes reuse this layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/server/package.json apps/server/
COPY apps/viewer/package.json apps/viewer/
COPY packages/shared/package.json packages/shared/
COPY tools/pixelize/package.json tools/pixelize/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @benchmaxxers/viewer build

ENV NODE_ENV=production \
    DB_PATH=/data/gym.sqlite \
    STATIC_DIR=/app/apps/viewer/dist \
    PORT=8787
EXPOSE 8787

# Plain node (not pnpm) so SIGTERM on a redeploy reaches the server and it closes cleanly.
WORKDIR /app/apps/server
CMD ["node", "--import", "tsx", "src/index.ts"]
