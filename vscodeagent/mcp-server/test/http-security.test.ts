import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAllowedOrigins,
  isAllowedOrigin,
  isAuthorizedHeader,
  isLoopbackHost,
  validateHttpConfig,
} from "../src/http-security.js";

test("requires a token for non-loopback HTTP binds", () => {
  assert.throws(() => validateHttpConfig("0.0.0.0"), /MCP_AUTH_TOKEN is required/);
  assert.throws(() => validateHttpConfig("192.168.100.200", "short"), /at least 32 characters/);
  assert.doesNotThrow(() => validateHttpConfig("192.168.100.200", "a".repeat(32)));
});

test("recognizes loopback hosts", () => {
  assert.equal(isLoopbackHost("127.0.0.1"), true);
  assert.equal(isLoopbackHost("[::1]"), true);
  assert.equal(isLoopbackHost("192.168.100.200"), false);
});

test("allows only same-host or explicitly configured HTTP origins", () => {
  const defaults = buildAllowedOrigins("192.168.100.200", 3100);
  assert.equal(isAllowedOrigin("http://192.168.100.200:3100", defaults), true);
  assert.equal(isAllowedOrigin("http://attacker.example", defaults), false);
  assert.equal(isAllowedOrigin(undefined, defaults), true);

  const configured = buildAllowedOrigins(
    "0.0.0.0",
    3100,
    "https://docs.example.test",
  );
  assert.equal(isAllowedOrigin("https://docs.example.test", configured), true);
  assert.equal(isAllowedOrigin("http://192.168.100.200:3100", configured), false);
  assert.throws(
    () => buildAllowedOrigins("0.0.0.0", 3100, "https://example.test/path"),
    /without paths/,
  );
});

test("checks bearer authorization without accepting malformed headers", () => {
  const token = "a".repeat(32);
  assert.equal(isAuthorizedHeader(`Bearer ${token}`, token), true);
  assert.equal(isAuthorizedHeader(`Bearer ${"b".repeat(32)}`, token), false);
  assert.equal(isAuthorizedHeader(token, token), false);
  assert.equal(isAuthorizedHeader(undefined, token), false);
});
