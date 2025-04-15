FROM node:23.11.0 as build-stage
WORKDIR /app

# Copy root-level package files and post-install script
COPY package*.json ./
COPY post-install.sh ./
RUN chmod +x ./post-install.sh

# Copy frontend package files
COPY packages/frontend/package*.json ./packages/frontend/

# Install dependencies
RUN npm ci

# Copy env file that is created in CI
COPY .env.production ./

# Copy the rest of the code
COPY tsconfig.json ./
COPY packages/shared ./packages/shared
COPY packages/frontend ./packages/frontend
COPY docker/prod ./docker/prod

# Set working directory to frontend before build
WORKDIR /app/packages/frontend
RUN npm run build

FROM nginx as production-stage
RUN mkdir /app
COPY --from=build-stage /app/packages/frontend/dist /app
COPY packages/frontend/nginx.conf /etc/nginx/nginx.conf
