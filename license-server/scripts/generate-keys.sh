#!/usr/bin/env bash
# Generate RSA-2048 key pair for AtendIA License Server JWT signing
# Run from project root: bash scripts/generate-keys.sh

set -euo pipefail

KEYS_DIR="$(dirname "$0")/../keys"
mkdir -p "$KEYS_DIR"

PRIVATE_KEY="$KEYS_DIR/private.pem"
PUBLIC_KEY="$KEYS_DIR/public.pem"

if [ -f "$PRIVATE_KEY" ] || [ -f "$PUBLIC_KEY" ]; then
  echo "WARNING: Key files already exist in $KEYS_DIR/"
  read -rp "Overwrite? (y/N) " confirm
  if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
    echo "Aborted."
    exit 0
  fi
fi

echo "Generating RSA-2048 private key..."
openssl genrsa -out "$PRIVATE_KEY" 2048

echo "Extracting public key..."
openssl rsa -in "$PRIVATE_KEY" -pubout -out "$PUBLIC_KEY"

echo "Setting restrictive permissions..."
chmod 600 "$PRIVATE_KEY"
chmod 644 "$PUBLIC_KEY"

echo ""
echo "Keys generated successfully:"
echo "  Private: $PRIVATE_KEY"
echo "  Public:  $PUBLIC_KEY"
echo ""
echo "IMPORTANT: Keep private.pem secure and never commit it to version control."
echo "Add 'keys/' to your .gitignore if not already present."
