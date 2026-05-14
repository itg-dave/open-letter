"use strict";

/**
 * srs_forward — Haraka SRS (Sender Rewriting Scheme) plugin
 *
 * hook_rcpt  — decodes inbound SRS0 bounce addresses so bounces find their
 *              way back to the original sender, not the forwarding address.
 *
 * hook_queue — rewrites MAIL FROM on messages being forwarded to an external
 *              domain so the receiving server's SPF check passes.
 *
 * Configure via config/srs_forward.ini:
 *   [main]
 *   secret=<strong random value>   ; openssl rand -hex 32
 *   max_age_days=21
 */

const crypto = require("crypto");

// ─── Minimal inline SRS0 implementation (no external npm dep needed) ─────────

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function b32Encode(n, len) {
  let s = "";
  for (let i = 0; i < len; i++) {
    s = B32[n & 0x1f] + s;
    n >>>= 5;
  }
  return s;
}

function b32Decode(s) {
  let n = 0;
  for (const c of s.toUpperCase()) {
    const idx = B32.indexOf(c);
    if (idx < 0) throw new Error(`Invalid base32 char: ${c}`);
    n = (n << 5) | idx;
  }
  return n;
}

function srsHash(secret, ts, domain, local) {
  return crypto
    .createHmac("sha1", secret)
    .update(ts + domain + local)
    .digest("hex")
    .slice(0, 4)
    .toUpperCase();
}

function srsTimestamp() {
  return b32Encode(Math.floor(Date.now() / 86400000) % 1024, 2);
}

/**
 * Rewrite `addr` (e.g. sender@example.com) to an SRS0-encoded address at
 * `srsHost` (e.g. gehaltsdeckel.jetzt).
 * Result: SRS0=HASH=TT=example.com=sender@gehaltsdeckel.jetzt
 */
function srsRewrite(addr, srsHost, secret) {
  const at = addr.lastIndexOf("@");
  if (at < 0) throw new Error(`Cannot SRS-rewrite invalid address: ${addr}`);
  const local = addr.slice(0, at);
  const domain = addr.slice(at + 1);
  const ts = srsTimestamp();
  const hash = srsHash(secret, ts, domain, local);
  return `SRS0=${hash}=${ts}=${domain}=${local}@${srsHost}`;
}

/**
 * Decode an SRS0 bounce address back to the original sender.
 * Throws if the hash is wrong or the timestamp is expired.
 */
function srsReverse(srsAddr, secret, maxAgeDays) {
  const at = srsAddr.lastIndexOf("@");
  const localPart = at >= 0 ? srsAddr.slice(0, at) : srsAddr;
  // SRS0=HASH=TT=ORIGINAL_DOMAIN=ORIGINAL_LOCAL
  // The last two groups use greedy/non-greedy to handle '=' in the local part.
  const m = localPart.match(/^SRS0=([^=]+)=([^=]+)=([^=]+)=(.+)$/i);
  if (!m) throw new Error(`Not a valid SRS0 address: ${srsAddr}`);
  const [, hash, ts, domain, local] = m;

  const expected = srsHash(secret, ts, domain, local);
  if (expected !== hash)
    throw new Error("SRS hash mismatch — possible forgery");

  const sentDay = b32Decode(ts) % 1024;
  const nowDay = Math.floor(Date.now() / 86400000) % 1024;
  const diff = (nowDay - sentDay + 1024) % 1024;
  if (diff > maxAgeDays)
    throw new Error(`SRS timestamp expired (${diff} days old)`);

  return `${local}@${domain}`;
}

// ─── Plugin state ─────────────────────────────────────────────────────────────

let cfgSecret = null;
let cfgMaxAge = 21;
let srsHost = "gehaltsdeckel.jetzt";

// ─── Haraka hooks ─────────────────────────────────────────────────────────────

exports.register = function () {
  const cfg = this.config.get("srs_forward.ini");
  const secret = cfg && cfg.main && cfg.main.secret;

  if (!secret || secret === "CHANGE_ME_RANDOM_SECRET") {
    this.logerror(
      "srs_forward: no valid secret in config/srs_forward.ini — SRS is DISABLED",
    );
    return;
  }

  cfgSecret = secret;
  cfgMaxAge = parseInt((cfg.main && cfg.main.max_age_days) || "21", 10);

  // Derive the public-facing domain from `me` (strip leading "mail.")
  const me = (this.config.get("me") || "").trim();
  srsHost = me.replace(/^mail\./, "") || "gehaltsdeckel.jetzt";

  this.loginfo(
    `srs_forward: enabled — SRS host = ${srsHost}, max_age = ${cfgMaxAge} days`,
  );
};

/**
 * hook_rcpt — runs for every RCPT TO command.
 *
 * If the recipient is an SRS0 bounce address addressed to us, decode it back
 * to the original sender and allow relay so the bounce is delivered there.
 * Must be listed BEFORE the aliases plugin in config/plugins.
 */
exports.hook_rcpt = function (next, connection, params) {
  if (!cfgSecret) return next();

  const rcpt = params[0];
  if (!rcpt) return next();

  const addr =
    typeof rcpt.address === "function" ? rcpt.address() : String(rcpt);
  if (!/^SRS0=/i.test(addr)) return next();

  // Only handle SRS addresses targeting our own domain
  const atPos = addr.lastIndexOf("@");
  const domain = atPos >= 0 ? addr.slice(atPos + 1).toLowerCase() : "";
  if (domain !== srsHost) return next();

  try {
    const original = srsReverse(addr, cfgSecret, cfgMaxAge);
    this.loginfo(`srs_forward: decoded bounce  ${addr}  →  ${original}`);
    // Replace the RCPT with the original sender's address
    params[0] = new rcpt.constructor(`<${original}>`);
    connection.relaying = true;
    return next(OK);
  } catch (e) {
    this.logerror(`srs_forward: invalid SRS bounce ${addr}: ${e.message}`);
    return next(DENY, "Invalid or expired SRS bounce address");
  }
};

/**
 * hook_queue — runs once per transaction, just before queuing.
 *
 * For messages being forwarded to an external domain (MAIL FROM is a foreign
 * address), rewrite MAIL FROM to an SRS0 address at our domain so that the
 * receiving mail server's SPF check passes.
 */
exports.hook_queue = function (next, connection) {
  if (!cfgSecret) return next();

  const txn = connection.transaction;
  if (!txn) return next();

  const mailFrom = txn.mail_from;
  if (!mailFrom) return next();

  const fromAddr =
    typeof mailFrom.address === "function"
      ? mailFrom.address()
      : String(mailFrom);

  // Skip: empty bounce sender, already SRS-encoded, or our own outbound mail
  if (
    !fromAddr ||
    /^SRS[01]=/i.test(fromAddr) ||
    fromAddr.toLowerCase().endsWith("@" + srsHost)
  ) {
    return next();
  }

  // Only rewrite when at least one recipient is at an external domain
  const hasExternalRcpt =
    Array.isArray(txn.rcpt_to) &&
    txn.rcpt_to.some((r) => {
      const host = (r.host || "").toLowerCase();
      return host && host !== srsHost;
    });
  if (!hasExternalRcpt) return next();

  try {
    const rewritten = srsRewrite(fromAddr, srsHost, cfgSecret);
    txn.mail_from = new mailFrom.constructor(`<${rewritten}>`);
    this.loginfo(
      `srs_forward: rewrote MAIL FROM  ${fromAddr}  →  ${rewritten}`,
    );
  } catch (e) {
    this.logerror(
      `srs_forward: MAIL FROM rewrite failed for ${fromAddr}: ${e.message}`,
    );
  }

  next();
};
