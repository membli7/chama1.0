"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const accountsPath = path.resolve(__dirname, '..', 'uploads', 'profile-details.json');
const scriptPath = path.resolve(__dirname, '..', 'scripts', 'clear-accounts.js');

describe('Account deletion script', () => {
  test('clears all accounts', () => {
    // Ensure there is at least one account before running script
    const original = { dummy: { firstName: 'Test', lastName: 'User' } };
    fs.writeFileSync(accountsPath, JSON.stringify(original, null, 2), 'utf8');
    // Run the clear script
    execSync(`node "${scriptPath}"`);
    const result = JSON.parse(fs.readFileSync(accountsPath, 'utf8'));
    assert.deepEqual(result, {});
  });
});
