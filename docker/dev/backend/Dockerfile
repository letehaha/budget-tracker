FROM node:21.7.3
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./
COPY post-install.sh ./
COPY packages/backend/package*.json ./packages/backend/
COPY packages/shared/package*.json ./packages/shared/
COPY docker/dev/backend/docker-destroy.sh ./docker/dev/backend/docker-destroy.sh

# Copy TS configs
COPY tsconfig*.json ./
COPY packages/backend/tsconfig*.json ./packages/backend/
COPY packages/shared/tsconfig*.json ./packages/shared/

# Install dependencies
RUN chmod +x ./post-install.sh
RUN npm ci

# Copy source code
COPY packages/backend ./packages/backend
COPY packages/shared ./packages/shared

ENV NODE_ENV=development

COPY docker/dev/backend/docker-entrypoint.sh /
RUN chmod +x /docker-entrypoint.sh
ENTRYPOINT ["/docker-entrypoint.sh"]

CMD ["npm", "run", "-w", "packages/backend", "dev"]
