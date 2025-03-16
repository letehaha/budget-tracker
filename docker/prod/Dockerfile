FROM node:21.7.3
WORKDIR /app

# Copy the rest of the application
COPY . .

ENV NODE_ENV=production

# Install dependencies
RUN chmod +x ./post-install.sh
RUN npm ci --also=dev

CMD ["/bin/sh", "-c", "npm run prod"]
