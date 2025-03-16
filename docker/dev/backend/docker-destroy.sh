#!/bin/sh

echo "Starting removing all dev container completely..."

npm run docker:dev -- -d
npm run docker:dev:down -- --rmi all --volumes
