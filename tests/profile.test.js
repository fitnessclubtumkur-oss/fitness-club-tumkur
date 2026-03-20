// tests/profile.test.js
'use strict';

const request = require('supertest');
const app     = require('../src/app');
const prisma  = require('../src/config/db');
const { calculateBMR, calculateTDEE, calculateMacroTargets, calculateCaloriesBurned, calculateFoodNutrition } = require('../src/utils/calc');

let token  = null;
let userId = null;

beforeAll(async () => {
  const res = await request(app).post('/api/auth/register').send({
    email: `profile_test_${Date.now()}@test.com`,
    pin: '987654',
    name: 'Profile Tester',
  });
  token  = res.body.data.token;
  userId = res.body.data.user.id;
});

afterAll(async () => {
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  await prisma.$disconnect();
});

const auth = () => ({ Authorization: `Bearer ${token}` });

// ── CALC UNIT TESTS ──────────────────────────────────────────────────────────
describe('calculateBMR()', () => {
  it('should calculate male BMR correctly (Mifflin-St Jeor)', () => {
    // Male, 75kg, 175cm, 28yo → 10*75 + 6.25*175 - 5*28 + 5 = 1774.75
    const bmr = calculateBMR('MALE', 75, 175, 28);
    expect(bmr).toBeCloseTo(1774.75, 0);
  });

  it('should calculate female BMR correctly', () => {
    // Female, 60kg, 162cm, 25yo → 10*60 + 6.25*162 - 5*25 - 161 = 1390.5
    const bmr = calculateBMR('FEMALE', 60, 162, 25);
    expect(bmr).toBeCloseTo(1390.5, 0);
  });
});

describe('calculateTDEE()', () => {
  it('should multiply BMR by correct activity factor', () => {
    const tdee = calculateTDEE('MALE', 75, 175, 28, 'MODERATE');
    expect(tdee).toBeGreaterThan(2500);
    expect(tdee).toBeLessThan(3000);
  });

  it('ACTIVE should be higher than SEDENTARY', () => {
    const sed    = calculateTDEE('MALE', 75, 175, 28, 'SEDENTARY');
    const active = calculateTDEE('MALE', 75, 175, 28, 'ACTIVE');
    expect(active).toBeGreaterThan(sed);
  });
});

describe('calculateMacroTargets()', () => {
  it('should apply calorie deficit for WEIGHT_LOSS', () => {
    const tdee = calculateTDEE('MALE', 75, 175, 28, 'MODERATE');
    const macros = calculateMacroTargets('WEIGHT_LOSS', 75, tdee);
    expect(macros.calories).toBeLessThan(tdee);
    expect(macros.calories).toBeCloseTo(tdee * 0.8, -2);
  });

  it('should apply calorie surplus for MUSCLE_GAIN', () => {
    const tdee = calculateTDEE('MALE', 75, 175, 28, 'MODERATE');
    const macros = calculateMacroTargets('MUSCLE_GAIN', 75, tdee);
    expect(macros.calories).toBeGreaterThan(tdee);
  });

  it('macro calories should sum to total calories ±5%', () => {
    const tdee = 2500;
    const macros = calculateMacroTargets('MAINTENANCE', 70, tdee);
    const fromMacros = macros.protein_g * 4 + macros.carbs_g * 4 + macros.fats_g * 9;
    expect(Math.abs(fromMacros - macros.calories) / macros.calories).toBeLessThan(0.05);
  });
});

describe('calculateCaloriesBurned()', () => {
  it('should return positive calories for all workout types', () => {
    ['CARDIO', 'RESISTANCE', 'YOGA', 'AEROBICS', 'RUNNING', 'TREKKING'].forEach(type => {
      const cal = calculateCaloriesBurned(type, 70, 30, 'MODERATE');
      expect(cal).toBeGreaterThan(0);
    });
  });

  it('HIGH intensity should burn more than LOW', () => {
    const low  = calculateCaloriesBurned('CARDIO', 70, 30, 'LOW');
    const high = calculateCaloriesBurned('CARDIO', 70, 30, 'HIGH');
    expect(high).toBeGreaterThan(low);
  });

  it('elevation should increase trekking calorie burn', () => {
    const flat     = calculateCaloriesBurned('TREKKING', 70, 120, 'MODERATE', 0);
    const elevated = calculateCaloriesBurned('TREKKING', 70, 120, 'MODERATE', 600);
    expect(elevated).toBeGreaterThan(flat);
  });

  it('heavier person should burn more calories', () => {
    const light = calculateCaloriesBurned('RUNNING', 60,  30, 'MODERATE');
    const heavy = calculateCaloriesBurned('RUNNING', 100, 30, 'MODERATE');
    expect(heavy).toBeGreaterThan(light);
  });
});

describe('calculateFoodNutrition()', () => {
  const mockFood = {
    calories: 356, protein_g: 7, carbs_g: 79, fats_g: 0.5,
    fiber_g: 0.4, calcium_mg: 10, iron_mg: 0.8,
    vitamin_c_mg: 0, zinc_mg: 0, sodium_mg: 0,
  };

  it('should scale correctly at 100g (same as per-100g values)', () => {
    const n = calculateFoodNutrition(mockFood, 100);
    expect(n.calories).toBeCloseTo(356, 0);
    expect(n.protein_g).toBeCloseTo(7, 0);
  });

  it('should halve values at 50g', () => {
    const n = calculateFoodNutrition(mockFood, 50);
    expect(n.calories).toBeCloseTo(178, 0);
    expect(n.protein_g).toBeCloseTo(3.5, 1);
  });

  it('should double values at 200g', () => {
    const n = calculateFoodNutrition(mockFood, 200);
    expect(n.calories).toBeCloseTo(712, 0);
  });

  it('should never return negative values', () => {
    const n = calculateFoodNutrition(mockFood, 0.1);
    Object.values(n).forEach(v => expect(v).toBeGreaterThanOrEqual(0));
  });
});

// ── PROFILE API TESTS ─────────────────────────────────────────────────────────
describe('POST /api/profile (upsert fitness profile)', () => {
  it('should create a profile and auto-calculate goals', async () => {
    const res = await request(app).post('/api/profile').set(auth()).send({
      age: 28, gender: 'MALE', height_cm: 175, weight_kg: 75,
      activity_level: 'MODERATE', primary_goal: 'MUSCLE_GAIN',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.profile.age).toBe(28);
    expect(res.body.data.tdee).toBeGreaterThan(2000);
    expect(res.body.data.recommended_goals.target_calories).toBeGreaterThan(0);
    expect(res.body.data.recommended_goals.target_protein_g).toBeGreaterThan(0);
  });

  it('should return 422 for invalid age', async () => {
    const res = await request(app).post('/api/profile').set(auth()).send({
      age: 5, gender: 'MALE', height_cm: 175, weight_kg: 75,
    });
    expect(res.status).toBe(422);
  });
});

describe('GET /api/profile', () => {
  it('should return the stored profile', async () => {
    const res = await request(app).get('/api/profile').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.profile.weight_kg).toBe(75);
    expect(res.body.data.tdee).toBeDefined();
  });
});

describe('POST /api/profile/goals', () => {
  it('should set custom macro goals', async () => {
    const res = await request(app).post('/api/profile/goals').set(auth()).send({
      target_calories: 2200, target_protein_g: 165, target_carbs_g: 220, target_fats_g: 73,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.goals.target_protein_g).toBe(165);
  });
});

describe('GET /api/profile/goals', () => {
  it('should return active goals', async () => {
    const res = await request(app).get('/api/profile/goals').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.goals.target_calories).toBe(2200);
  });
});

describe('GET /api/profile/recommended-macros', () => {
  it('should compute TDEE and macro recommendations', async () => {
    const res = await request(app).get('/api/profile/recommended-macros').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.tdee).toBeGreaterThan(2000);
    expect(res.body.data.recommended.protein_g).toBeGreaterThan(100);
  });
});

describe('PATCH /api/profile/weight', () => {
  it('should update body weight', async () => {
    const res = await request(app).patch('/api/profile/weight').set(auth()).send({ weight_kg: 73.5 });
    expect(res.status).toBe(200);
    expect(res.body.data.profile.weight_kg).toBe(73.5);
  });
});
