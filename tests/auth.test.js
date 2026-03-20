// tests/auth.test.js
'use strict';

const request = require('supertest');
const app     = require('../src/app');
const prisma  = require('../src/config/db');

const TEST_EMAIL = `test_${Date.now()}@fitnessapp.com`;
const TEST_PIN   = '123456';
let authToken    = null;

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { contains: `test_` } } });
  await prisma.$disconnect();
});

describe('POST /api/auth/register', () => {
  it('should register a new user', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: TEST_EMAIL,
      pin: TEST_PIN,
      name: 'Test User',
    });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.email).toBe(TEST_EMAIL);
    authToken = res.body.data.token;
  });

  it('should reject duplicate email', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: TEST_EMAIL,
      pin: TEST_PIN,
    });
    expect(res.status).toBe(409);
  });

  it('should reject invalid PIN (letters)', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'other@test.com',
      pin: 'abcdef',
    });
    expect(res.status).toBe(422);
  });

  it('should reject short PIN', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'other2@test.com',
      pin: '1234',
    });
    expect(res.status).toBe(422);
  });
});

describe('POST /api/auth/login', () => {
  it('should login with correct credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: TEST_EMAIL,
      pin: TEST_PIN,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeDefined();
    authToken = res.body.data.token;
  });

  it('should reject wrong PIN', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: TEST_EMAIL,
      pin: '999999',
    });
    expect(res.status).toBe(401);
  });

  it('should reject unknown email', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'nobody@test.com',
      pin: TEST_PIN,
    });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  it('should return current user with valid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(TEST_EMAIL);
  });

  it('should reject missing token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('should reject invalid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid_token_xyz');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('should logout successfully', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
  });

  it('should reject after logout', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(401);
  });
});

describe('GET /api/health', () => {
  it('should return healthy status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBeDefined();
    expect(res.body.data.version).toBe('1.0.0');
  });
});
