FROM node:21.6.0 as build-stage
WORKDIR /app
COPY package*.json ./
COPY tsconfig.json ./
COPY bun.lockb ./
COPY post-install.sh ./
COPY packages/shared ./packages/shared
COPY packages/frontend ./packages/frontend
COPY docker/dev ./docker/dev

# Install dependencies
RUN chmod +x ./post-install.sh

# Error: Cannot find module @rollup/rollup-linux-arm64-gnu. npm has a bug
# related to optional dependencies (https://github.com/npm/cli/issues/4828).
# Here we're removing package-lock and installing packages as we need
RUN rm -rf package-lock.json node_modules
RUN npm install

CMD ["npm", "run", "-w", "packages/frontend", "dev"]
