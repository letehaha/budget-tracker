#!/bin/bash

# Script to generate SSL certificates for local HTTPS development
# Uses mkcert to create locally-trusted certificates

set -e

CERTS_DIR="docker/dev/certs"

echo "🔐 Generating SSL certificates for local HTTPS development..."

# Check if mkcert is installed
if ! command -v mkcert &> /dev/null; then
    echo "❌ mkcert is not installed!"
    echo ""
    echo "Please install mkcert first:"
    echo "  macOS:   brew install mkcert"
    echo "  Linux:   https://github.com/FiloSottile/mkcert#linux"
    echo "  Windows: https://github.com/FiloSottile/mkcert#windows"
    exit 1
fi

# Install local CA if not already installed
echo "📋 Installing local Certificate Authority..."
mkcert -install

# Create certs directory if it doesn't exist
mkdir -p "$CERTS_DIR"

# Generate certificates
cd "$CERTS_DIR"
echo "📝 Generating certificates for:"
echo "  - localhost"
echo "  - 127.0.0.1"
echo "  - ::1"

mkcert -key-file key.pem -cert-file cert.pem localhost 127.0.0.1 ::1

echo ""
echo "✅ SSL certificates generated successfully!"
echo "📁 Location: $CERTS_DIR/"
echo "   - cert.pem (certificate)"
echo "   - key.pem (private key)"
echo ""
echo "🚀 You can now run: npm run docker:dev"
echo "   Frontend: https://localhost:8100"
echo "   Backend:  https://localhost:8081"
