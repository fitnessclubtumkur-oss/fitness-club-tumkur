// tests/phase3a.test.js
// Phase 3A — Live Classes + Specialist Programs + Blood Sugar + Cycle Tracking
'use strict';

const request = require('supertest');
const app     = require('../src/app');

// ── Helpers ───────────────────────────────────────────────────────────────────
let token = '';
let userId = '';
let testClassId  = '';
let testProgramId = '';

const testEmail = `phase3a_${Date.now()}@fitfuel.test`;
const testPin   = '112233';

async function register() {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email: testEmail, pin: testPin, name: 'Phase3A Tester' });
  token  = res.body.data?.token;
  userId = res.body.data?.user?.id;
  return res;
}

async function auth() { return { Authorization: `Bearer ${token}` }; }

// ─────────────────────────────────────────────────────────────────────────────
describe('Auth setup', () => {
  it('registers a test user', async () => {
    const res = await register();
    expect(res.status).toBe(201);
    expect(token).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Workout Classes', () => {
  it('lists classes (public)', async () => {
    const res = await request(app).get('/api/classes');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.classes)).toBe(true);
  });

  it('filters classes by type', async () => {
    const res = await request(app).get('/api/classes?type=YOGA');
    expect(res.status).toBe(200);
    res.body.data.classes.forEach(c => expect(c.class_type).toBe('YOGA'));
  });

  it('returns live schedule', async () => {
    const res = await request(app).get('/api/classes/live');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('classes');
    expect(res.body.data).toHaveProperty('date');
  });

  it('admin creates a class', async () => {
    const res = await request(app)
      .post('/api/classes')
      .set(await auth())
      .send({
        title:        'Test Yoga Class',
        instructor:   'Test Instructor',
        class_type:   'YOGA',
        level:        'BEGINNER',
        duration_min: 30,
        is_live:      false,
        is_free:      true,
      });
    expect(res.status).toBe(201);
    testClassId = res.body.data?.id;
    expect(testClassId).toBeTruthy();
  });

  it('gets a single class', async () => {
    if (!testClassId) return;
    const res = await request(app).get(`/api/classes/${testClassId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Test Yoga Class');
  });

  it('books a class', async () => {
    if (!testClassId) return;
    const res = await request(app)
      .post(`/api/classes/${testClassId}/book`)
      .set(await auth());
    expect(res.status).toBe(201);
    expect(res.body.data.class_title).toBe('Test Yoga Class');
  });

  it('rejects duplicate booking', async () => {
    if (!testClassId) return;
    const res = await request(app)
      .post(`/api/classes/${testClassId}/book`)
      .set(await auth());
    expect(res.status).toBe(409);
  });

  it('completes a class and auto-logs workout', async () => {
    if (!testClassId) return;
    const res = await request(app)
      .post(`/api/classes/${testClassId}/complete`)
      .set(await auth())
      .send({ date: new Date().toISOString() });
    expect(res.status).toBe(200);
    expect(res.body.data.auto_logged).toBe(true);
    expect(res.body.data.calories_burned).toBeGreaterThan(0);
  });

  it('rates a completed class', async () => {
    if (!testClassId) return;
    const res = await request(app)
      .post(`/api/classes/${testClassId}/rate`)
      .set(await auth())
      .send({ rating: 5, review: 'Excellent class!' });
    expect(res.status).toBe(200);
  });

  it('gets my class bookings', async () => {
    const res = await request(app)
      .get('/api/classes/my/bookings')
      .set(await auth());
    expect(res.status).toBe(200);
    expect(res.body.data.bookings.length).toBeGreaterThan(0);
    expect(res.body.data.stats).toHaveProperty('attended');
  });

  it('rejects booking without auth', async () => {
    const res = await request(app).post(`/api/classes/${testClassId}/book`);
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Specialist Programs', () => {
  it('lists all programs (public)', async () => {
    const res = await request(app).get('/api/programs');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('filters by type DIABETES', async () => {
    const res = await request(app).get('/api/programs?type=DIABETES');
    expect(res.status).toBe(200);
    res.body.data.forEach(p => expect(p.program_type).toBe('DIABETES'));
  });

  it('enrolls in a program', async () => {
    // Get first available program
    const list = await request(app).get('/api/programs');
    if (!list.body.data?.length) return;
    const prog = list.body.data[0];
    testProgramId = prog.id;

    const res = await request(app)
      .post('/api/programs/enroll')
      .set(await auth())
      .send({ program_id: prog.id, notes: 'Excited to start!' });
    expect(res.status).toBe(201);
    expect(res.body.data.program_id).toBe(prog.id);
    expect(res.body.data.current_week).toBe(1);
  });

  it('rejects duplicate enrollment', async () => {
    if (!testProgramId) return;
    const res = await request(app)
      .post('/api/programs/enroll')
      .set(await auth())
      .send({ program_id: testProgramId });
    expect(res.status).toBe(409);
  });

  it('gets my enrollments', async () => {
    const res = await request(app)
      .get('/api/programs/my/enrollments')
      .set(await auth());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    if (res.body.data.length) {
      expect(res.body.data[0]).toHaveProperty('progress_pct');
      expect(res.body.data[0]).toHaveProperty('weeks_passed');
    }
  });

  it('requires auth to enroll', async () => {
    const res = await request(app)
      .post('/api/programs/enroll')
      .send({ program_id: 'any' });
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Blood Sugar Logging', () => {
  it('logs a fasting reading in mmol', async () => {
    const res = await request(app)
      .post('/api/blood-sugar')
      .set(await auth())
      .send({ reading: 5.2, unit: 'mmol', log_type: 'FASTING' });
    expect(res.status).toBe(201);
    expect(res.body.data.reading_mmol).toBe(5.2);
    expect(res.body.data.reading_mgdl).toBeGreaterThan(80);
    expect(res.body.data.risk_level).toBe('NORMAL');
  });

  it('classifies HIGH reading correctly', async () => {
    const res = await request(app)
      .post('/api/blood-sugar')
      .set(await auth())
      .send({ reading: 8.5, unit: 'mmol', log_type: 'FASTING' });
    expect(res.status).toBe(201);
    expect(res.body.data.risk_level).toBe('HIGH');
  });

  it('classifies LOW reading correctly', async () => {
    const res = await request(app)
      .post('/api/blood-sugar')
      .set(await auth())
      .send({ reading: 3.2, unit: 'mmol', log_type: 'RANDOM' });
    expect(res.status).toBe(201);
    expect(res.body.data.risk_level).toBe('LOW');
  });

  it('accepts mgdl unit', async () => {
    const res = await request(app)
      .post('/api/blood-sugar')
      .set(await auth())
      .send({ reading: 110, unit: 'mgdl', log_type: 'POST_MEAL_2H' });
    expect(res.status).toBe(201);
    expect(res.body.data.reading_mmol).toBeLessThan(7);
  });

  it('returns log history with stats', async () => {
    const res = await request(app)
      .get('/api/blood-sugar')
      .set(await auth());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.logs)).toBe(true);
    expect(res.body.data.stats).toHaveProperty('avg_mmol');
    expect(res.body.data.stats).toHaveProperty('in_range');
  });

  it('rejects invalid log_type', async () => {
    const res = await request(app)
      .post('/api/blood-sugar')
      .set(await auth())
      .send({ reading: 5.5, unit: 'mmol', log_type: 'INVALID' });
    expect(res.status).toBe(422);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Cycle Tracking', () => {
  let entryId = '';

  it('logs a period entry', async () => {
    const today = new Date().toISOString().split('T')[0];
    const res = await request(app)
      .post('/api/cycle')
      .set(await auth())
      .send({
        period_start:  today,
        cycle_length:  28,
        period_length: 5,
        flow_intensity: 'MEDIUM',
        symptoms:      ['cramps', 'bloating'],
        mood:          'irritable',
      });
    expect(res.status).toBe(201);
    entryId = res.body.data?.id;
    expect(entryId).toBeTruthy();
  });

  it('gets cycle history with predictions', async () => {
    const res = await request(app)
      .get('/api/cycle')
      .set(await auth());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.cycles)).toBe(true);
    expect(res.body.data.stats).toHaveProperty('avg_cycle_length');
    expect(Array.isArray(res.body.data.predictions)).toBe(true);
    if (res.body.data.predictions.length) {
      expect(res.body.data.predictions[0]).toHaveProperty('predicted_start');
    }
  });

  it('updates a cycle entry', async () => {
    if (!entryId) return;
    const today = new Date().toISOString().split('T')[0];
    const res = await request(app)
      .patch(`/api/cycle/${entryId}`)
      .set(await auth())
      .send({ period_end: today, flow_intensity: 'LIGHT' });
    expect(res.status).toBe(200);
    expect(res.body.data.flow_intensity).toBe('LIGHT');
  });

  it('requires auth for cycle tracking', async () => {
    const res = await request(app)
      .post('/api/cycle')
      .send({ period_start: '2026-01-01' });
    expect(res.status).toBe(401);
  });

  it('rejects invalid flow_intensity', async () => {
    const today = new Date().toISOString().split('T')[0];
    const res = await request(app)
      .post('/api/cycle')
      .set(await auth())
      .send({ period_start: today, flow_intensity: 'EXTREME' });
    expect(res.status).toBe(422);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Multi-city Kitchen', () => {
  it('returns kitchens for bangalore', async () => {
    const res = await request(app).get('/api/kitchens/city/bangalore');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('city');
    expect(Array.isArray(res.body.data.kitchens)).toBe(true);
  });

  it('returns empty array for unsupported city', async () => {
    const res = await request(app).get('/api/kitchens/city/mumbai');
    expect(res.status).toBe(200);
    expect(res.body.data.kitchens).toHaveLength(0);
  });
});
