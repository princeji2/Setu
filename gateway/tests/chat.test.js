'use strict';

process.env.NODE_ENV = 'test';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const express = require('express');

const { createChatService, ChatError } = require('../src/citizen-api/services/chat-service');
const { createChatController } = require('../src/citizen-api/controllers/chat-controller');
const { createChatRouter } = require('../src/citizen-api/routes/chat');

function createTestApp(chatService) {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/chat', createChatRouter(chatService));
  return app;
}

test('ChatService: rejects empty message with VALIDATION 400', async () => {
  const service = createChatService({ geminiConfig: { apiKey: 'mock-key', model: 'gemini-test', timeoutMs: 1000 } });
  await assert.rejects(
    () => service.ask({ message: '   ' }),
    (err) => err instanceof ChatError && err.code === 'VALIDATION' && err.status === 400
  );
});

test('ChatService: rejects message longer than 1000 characters with VALIDATION 400', async () => {
  const service = createChatService({ geminiConfig: { apiKey: 'mock-key', model: 'gemini-test', timeoutMs: 1000 } });
  await assert.rejects(
    () => service.ask({ message: 'x'.repeat(1001) }),
    (err) => err instanceof ChatError && err.code === 'VALIDATION' && err.status === 400
  );
});

test('ChatService: missing API key throws UNAVAILABLE 503', async () => {
  const service = createChatService({ geminiConfig: { apiKey: '', model: 'gemini-test', timeoutMs: 1000 } });
  await assert.rejects(
    () => service.ask({ message: 'hello' }),
    (err) => err instanceof ChatError && err.code === 'UNAVAILABLE' && err.status === 503
  );
});

test('ChatService: Gemini 429 rate limit throws RATE_LIMITED 429 with details', async () => {
  const mockFetch = async () => ({
    status: 429,
    ok: false,
    json: async () => ({ error: { status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded' } }),
  });

  const service = createChatService({
    fetchImpl: mockFetch,
    geminiConfig: { apiKey: 'test-key', model: 'gemini-test', timeoutMs: 1000 },
  });

  await assert.rejects(
    () => service.ask({ message: 'hello' }),
    (err) => err instanceof ChatError && err.code === 'RATE_LIMITED' && err.status === 429 && err.details.upstreamStatus === 429
  );
});

test('ChatService: Gemini 403 / PERMISSION_DENIED throws UPSTREAM_AUTH 502 with details', async () => {
  const mockFetch = async () => ({
    status: 403,
    ok: false,
    json: async () => ({ error: { status: 'PERMISSION_DENIED', message: 'API key not valid' } }),
  });

  const service = createChatService({
    fetchImpl: mockFetch,
    geminiConfig: { apiKey: 'test-key', model: 'gemini-test', timeoutMs: 1000 },
  });

  await assert.rejects(
    () => service.ask({ message: 'hello' }),
    (err) => err instanceof ChatError && err.code === 'UPSTREAM_AUTH' && err.status === 502
  );
});

test('ChatService: Gemini timeout throws TIMEOUT 504', async () => {
  const mockFetch = async () => {
    const err = new Error('The operation was aborted');
    err.name = 'AbortError';
    throw err;
  };

  const service = createChatService({
    fetchImpl: mockFetch,
    geminiConfig: { apiKey: 'test-key', model: 'gemini-test', timeoutMs: 1000 },
  });

  await assert.rejects(
    () => service.ask({ message: 'hello' }),
    (err) => err instanceof ChatError && err.code === 'TIMEOUT' && err.status === 504
  );
});

test('ChatService: successful Gemini response extracts answer text', async () => {
  const mockFetch = async () => ({
    status: 200,
    ok: true,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: 'Setu connects government services securely.' }] } }],
    }),
  });

  const service = createChatService({
    fetchImpl: mockFetch,
    geminiConfig: { apiKey: 'test-key', model: 'gemini-test', timeoutMs: 1000 },
  });

  const res = await service.ask({ message: 'What is Setu?' });
  assert.equal(res.reply, 'Setu connects government services securely.');
});

test('ChatController: maps UNAVAILABLE error to 503 JSON response', async () => {
  const mockService = {
    async ask() {
      throw new ChatError('UNAVAILABLE', 'The assistant is not configured right now. Try one of the quick questions instead.', 503);
    },
  };
  const app = createTestApp(mockService);
  const res = await request(app).post('/api/v1/chat').send({ message: 'hello' });

  assert.equal(res.status, 503);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, 'UNAVAILABLE');
  assert.match(res.body.error.message, /not configured/);
});

test('ChatController: maps RATE_LIMITED error to 429 JSON response with details', async () => {
  const mockService = {
    async ask() {
      throw new ChatError('RATE_LIMITED', 'The assistant is busy right now.', 429, { upstreamStatus: 429 });
    },
  };
  const app = createTestApp(mockService);
  const res = await request(app).post('/api/v1/chat').send({ message: 'hello' });

  assert.equal(res.status, 429);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, 'RATE_LIMITED');
  assert.equal(res.body.error.details.upstreamStatus, 429);
});
