// tests/workout.test.js
'use strict';

const request = require('supertest');
const app     = require('../src/app');
const prisma  = require('../src/config/db');

let token = null;
let userId = null;

const TODAY = new Date().toISOString().split('T')[0];

beforeAll(async () => {
  const res = await request(app).post('/api/auth/register').send({
    email: `workout_test_${Date.now()}@test.com`,
    pin: '654321',
    name: 'Workout Tester',
  });
  token  = res.body.data.token;
  userId = res.body.data.user.id;

  // Create a profile for weight-based calorie calculations
  await request(app).post('/api/profile').set('Authorization', `Bearer ${token}`).send({
    age: 28, gender: 'MALE', height_cm: 175, weight_kg: 75,
    activity_level: 'MODERATE', primary_goal: 'MUSCLE_GAIN',
  });
});

afterAll(async () => {
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  await prisma.$disconnect();
});

const auth = () => ({ Authorization: `Bearer ${token}` });

describe('POST /api/workouts/cardio', () => {
  it('should log a cardio workout', async () => {
    const res = await request(app).post('/api/workouts/cardio').set(auth()).send({
      duration_min: 30, intensity: 'MODERATE', date: TODAY,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.calories_burned).toBeGreaterThan(0);
    expect(res.body.data.workout.type).toBe('CARDIO');
  });

  it('should reject missing duration', async () => {
    const res = await request(app).post('/api/workouts/cardio').set(auth()).send({ date: TODAY });
    expect(res.status).toBe(422);
  });
});

describe('POST /api/workouts/resistance', () => {
  it('should log a resistance workout with exercises', async () => {
    const res = await request(app).post('/api/workouts/resistance').set(auth()).send({
      date: TODAY,
      exercises: [
        { exercise: 'Bench Press', sets: [{ reps: 10, weight_kg: 60 }, { reps: 8, weight_kg: 65 }, { reps: 6, weight_kg: 70 }] },
        { exercise: 'Squat',       sets: [{ reps: 8,  weight_kg: 80 }, { reps: 8, weight_kg: 80 }] },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.data.total_volume_kg).toBeGreaterThan(0);
    expect(res.body.data.workout.exercise_logs.length).toBe(5); // 3 + 2 sets
  });
});

describe('POST /api/workouts/running', () => {
  it('should log a run with distance', async () => {
    const res = await request(app).post('/api/workouts/running').set(auth()).send({
      distance_km: 5.0, duration_min: 30, date: TODAY, route_name: 'Cubbon Park',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.pace_min_km).toBeDefined();
    expect(res.body.data.calories_burned).toBeGreaterThan(0);
  });
});

describe('POST /api/workouts/yoga', () => {
  it('should log a yoga session', async () => {
    const res = await request(app).post('/api/workouts/yoga').set(auth()).send({
      yoga_type: 'VINYASA', duration_min: 45, date: TODAY,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.workout.type).toBe('YOGA');
  });
});

describe('POST /api/workouts/trekking', () => {
  it('should log a trek with elevation', async () => {
    const res = await request(app).post('/api/workouts/trekking').set(auth()).send({
      distance_km: 8.0, duration_min: 180, elevation_m: 600, trail_name: 'Nandi Hills', date: TODAY,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.calories_burned).toBeGreaterThan(0);
  });
});

describe('GET /api/workouts', () => {
  it('should list workouts for a date', async () => {
    const res = await request(app).get(`/api/workouts?date=${TODAY}`).set(auth());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.workouts)).toBe(true);
    expect(res.body.data.workouts.length).toBeGreaterThanOrEqual(1);
  });

  it('should filter by type', async () => {
    const res = await request(app).get(`/api/workouts?type=CARDIO&date=${TODAY}`).set(auth());
    expect(res.status).toBe(200);
    res.body.data.workouts.forEach(w => expect(w.type).toBe('CARDIO'));
  });
});

describe('GET /api/workouts/stats', () => {
  it('should return workout statistics', async () => {
    const res = await request(app).get('/api/workouts/stats?period=MONTH').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.stats.total_workouts).toBeGreaterThanOrEqual(1);
    expect(typeof res.body.data.stats.total_calories_burned).toBe('number');
  });
});
