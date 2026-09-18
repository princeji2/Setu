'use strict';

/**
 * Step 1 auth tests. No live database required — the app is built with an
 * in-memory citizen repository so we exercise the real bcrypt + JWT +
 * duplicate/wrong-password logic in isolation.
 *
 * Covers exactly the four cases requested:
 *   1. successful registration
 *   2. duplicate email rejected
 *   3. login with correct credentials
 *   4. login with wrong password rejected
 */

process.env.NODE_ENV = 'test';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { createApp } = require('../src/app');
const { createInMemoryCitizenRepository } = require('../src/citizen-api/repositories/citizen-repository');

function freshApp() {
  const citizenRepository = createInMemoryCitizenRepository();
  return createApp({ citizenRepository });
}

const VALID = {
  full_name: 'Asha Kulkarni',
  email: 'asha@example.com',
  password: 'correct-horse-battery',
};

test('1. successful registration creates a citizen and returns a token', async () => {
  const app = freshApp();

  const res = await request(app).post('/api/v1/auth/register').send(VALID);

  assert.equal(res.status, 201);
  assert.equal(res.body.success, true);
  assert.ok(res.body.data.token, 'expected a JWT to be returned');
  assert.equal(res.body.data.citizen.email, VALID.email);
  assert.equal(res.body.data.citizen.full_name, VALID.full_name);
  // Never leak the hash or password back to the client.
  assert.equal(res.body.data.citizen.password_hash, undefined);
  assert.equal(res.body.data.citizen.password, undefined);
});

test('2. duplicate email is rejected with 409', async () => {
  const app = freshApp();

  const first = await request(app).post('/api/v1/auth/register').send(VALID);
  assert.equal(first.status, 201);

  // Same email, different case + different name — must still collide.
  const second = await request(app)
    .post('/api/v1/auth/register')
    .send({ ...VALID, full_name: 'Someone Else', email: 'ASHA@example.com' });

  assert.equal(second.status, 409);
  assert.equal(second.body.success, false);
  assert.equal(second.body.error.code, 'EMAIL_TAKEN');
});

test('3. login with correct credentials returns a token', async () => {
  const app = freshApp();

  await request(app).post('/api/v1/auth/register').send(VALID);

  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: VALID.email, password: VALID.password });

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.ok(res.body.data.token, 'expected a JWT on successful login');
  assert.equal(res.body.data.citizen.email, VALID.email);
});

test('4. login with wrong password is rejected with 401', async () => {
  const app = freshApp();

  await request(app).post('/api/v1/auth/register').send(VALID);

  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: VALID.email, password: 'wrong-password' });

  assert.equal(res.status, 401);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, 'INVALID_CREDENTIALS');
  assert.equal(res.body.data, undefined);
});
