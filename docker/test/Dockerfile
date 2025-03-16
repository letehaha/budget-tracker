FROM node:21.7.3

LABEL com.docker.compose.project=test

WORKDIR /app

# Copy package.json and package-lock.json files. This allows Docker to cache the
# npm dependencies as long as these files don't change.
COPY package*.json ./

# Install dependencies
COPY post-install.sh ./
COPY docker ./docker
RUN chmod +x ./post-install.sh
RUN npm ci --also=dev

# Copy the rest of the application
COPY . .

# Run this command to keep container alive. Without it will be demounted right after deps installation
CMD ["tail", "-f", "/dev/null"]
