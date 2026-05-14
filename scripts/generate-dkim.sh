#!/usr/bin/env bash
set -euo pipefail

DOMAIN="gehaltsdeckel.jetzt"
SELECTOR="mail"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KEYDIR="${SCRIPT_DIR}/../haraka/config/dkim/${DOMAIN}"

mkdir -p "${KEYDIR}"

echo "Generating RSA-2048 DKIM key for ${SELECTOR}._domainkey.${DOMAIN} ..."

# Generate 2048-bit RSA private key
openssl genrsa -out "${KEYDIR}/private" 2048 2>/dev/null

# Restrict permissions on private key
chmod 600 "${KEYDIR}/private"

# Export public key in DER format, base64-encode for DNS
PUB_B64=$(openssl rsa -in "${KEYDIR}/private" -pubout -outform DER 2>/dev/null | base64 | tr -d '\n')

# Write selector name
printf '%s' "${SELECTOR}" > "${KEYDIR}/selector"

echo ""
echo "Key written to: ${KEYDIR}/private"
echo ""
echo "========================================"
echo " DNS RECORDS — add these to your zone"
echo "========================================"
echo ""
echo "1. MX record:"
echo "   Name:     ${DOMAIN}"
echo "   Value:    mail.${DOMAIN}"
echo "   Priority: 10"
echo ""
echo "2. A record:"
echo "   Name:     mail.${DOMAIN}"
echo "   Value:    <YOUR_SERVER_IP>"
echo ""
echo "3. SPF TXT record:"
echo "   Name:     ${DOMAIN}"
echo "   Value:    v=spf1 a mx ~all"
echo ""
echo "4. DKIM TXT record:"
echo "   Name:     ${SELECTOR}._domainkey.${DOMAIN}"
echo "   Value:    v=DKIM1; k=rsa; p=${PUB_B64}"
echo ""
echo "5. DMARC TXT record:"
echo "   Name:     _dmarc.${DOMAIN}"
echo "   Value:    v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@${DOMAIN}; ruf=mailto:dmarc-reports@${DOMAIN}; fo=1; adkim=r; aspf=r; pct=100"
echo ""
echo "   NOTE: rua/ruf point to dmarc-reports@${DOMAIN} which Haraka will"
echo "   forward to gehaltsdeckel.jetzt@gmail.com via the aliases config."
echo "   Once DKIM and SPF are verified working, tighten p=quarantine → p=reject."
echo ""
echo "6. PTR record (reverse DNS):"
echo "   Ask your hosting provider to set:"
echo "   <YOUR_SERVER_IP>  →  mail.${DOMAIN}"
echo ""
echo "After setting DNS, restart the haraka container:"
echo "  docker compose restart haraka"
