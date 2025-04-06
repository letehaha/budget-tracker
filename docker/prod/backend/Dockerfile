FROM node:21.7.3
WORKDIR /app

# Copy root-level package files and post-install script
COPY package*.json ./
COPY post-install.sh ./
RUN chmod +x ./post-install.sh

# Copy backend package files
COPY packages/backend/package*.json ./packages/backend/

# Install dependencies
RUN npm ci --also=dev

# Copy the rest of the code
COPY tsconfig.json ./
COPY packages/shared ./packages/shared
COPY packages/backend ./packages/backend
COPY docker/prod ./docker/prod

# Set working directory to backend before build
WORKDIR /app/packages/backend

ENV NODE_ENV=production

CMD ["/bin/sh", "-c", "npm run prod"]
