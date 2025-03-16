FROM node:21.6.0 as build-stage
WORKDIR /app
COPY . .
RUN npm ci
RUN npm run build

FROM nginx as production-stage
RUN mkdir /app
COPY --from=build-stage /app/dist /app
COPY nginx.conf /etc/nginx/nginx.conf
