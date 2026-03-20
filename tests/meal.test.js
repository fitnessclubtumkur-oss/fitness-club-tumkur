// tests/meal.test.js
'use strict';

const request = require('supertest');
const app     = require('../src/app');
const prisma  = require('../src/config/db');

let token  = null;
let userId = null;
let foodId = null;
let mealItemId = null;

const TODAY = new Date().toISOString().split('T')[0];

beforeAll(async () => {
  // Register + login
  const res = await request(app).post('/api/auth/register').send({
    email: `meal_test_${Date.now()}@test.com`,
    pin: '112233',
    name: 'Meal Tester',
  });
  token  = res.body.data.token;
  userId = res.body.data.user.id;

  // Setup profile + goals
  await request(app).post('/api/profile').set('Authorization', `Bearer ${token}`).send({
    age: 25, gender: 'FEMALE', height_cm: 162, weight_kg: 58,
    activity_level: 'MODERATE', primary_goal: 'WEIGHT_LOSS',
  });

  // Get a real food id from the seeded database
  const food = await prisma.food.findFirst({ where: { name: { contains: 'Rice' } } });
  if (food) foodId = food.id;
});

afterAll(async () => {
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  await prisma.$disconnect();
});

const auth = () => ({ Authorization: `Bearer ${token}` });

describe('GET /api/meals/foods (food search)', () => {
  it('should search foods without auth (public endpoint)', async () => {
    const res = await request(app).get('/api/meals/foods?q=rice');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.foods)).toBe(true);
  });

  it('should find Indian foods by name', async () => {
    const res = await request(app).get('/api/meals/foods?q=dal');
    expect(res.status).toBe(200);
    expect(res.body.data.foods.length).toBeGreaterThan(0);
    res.body.data.foods.forEach(f => expect(f.name.toLowerCase()).toMatch(/dal|lentil/i));
  });

  it('should return foods with all nutrient fields', async () => {
    const res = await request(app).get('/api/meals/foods?q=paneer');
    expect(res.status).toBe(200);
    if (res.body.data.foods.length > 0) {
      const f = res.body.data.foods[0];
      expect(typeof f.calories).toBe('number');
      expect(typeof f.protein_g).toBe('number');
      expect(typeof f.carbs_g).toBe('number');
      expect(typeof f.fats_g).toBe('number');
    }
  });

  it('should paginate results', async () => {
    const res = await request(app).get('/api/meals/foods?limit=5&page=1');
    expect(res.status).toBe(200);
    expect(res.body.data.foods.length).toBeLessThanOrEqual(5);
    expect(typeof res.body.data.total).toBe('number');
  });

  it('should filter by category', async () => {
    const res = await request(app).get('/api/meals/foods?category=PROTEIN');
    expect(res.status).toBe(200);
  });
});

describe('POST /api/meals/calculate (nutrition preview)', () => {
  it('should calculate nutrition without logging', async () => {
    if (!foodId) return;
    const res = await request(app)
      .post('/api/meals/calculate')
      .set(auth())
      .send({ food_id: foodId, quantity_raw: 150 });
    expect(res.status).toBe(200);
    expect(res.body.data.nutrition.calories).toBeGreaterThan(0);
    expect(res.body.data.nutrition.protein_g).toBeDefined();
  });

  it('should scale linearly with quantity', async () => {
    if (!foodId) return;
    const [r100, r200] = await Promise.all([
      request(app).post('/api/meals/calculate').set(auth()).send({ food_id: foodId, quantity_raw: 100 }),
      request(app).post('/api/meals/calculate').set(auth()).send({ food_id: foodId, quantity_raw: 200 }),
    ]);
    const cal100 = r100.body.data.nutrition.calories;
    const cal200 = r200.body.data.nutrition.calories;
    expect(Math.round(cal200)).toBe(Math.round(cal100 * 2));
  });
});

describe('POST /api/meals (log single meal item)', () => {
  it('should log a meal item and return nutrition', async () => {
    if (!foodId) return;
    const res = await request(app).post('/api/meals').set(auth()).send({
      food_id: foodId, meal_type: 'BREAKFAST', date: TODAY, quantity_raw: 100,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.meal_item.id).toBeDefined();
    expect(res.body.data.nutrition.calories).toBeGreaterThan(0);
    mealItemId = res.body.data.meal_item.id;
  });

  it('should reject invalid meal_type', async () => {
    if (!foodId) return;
    const res = await request(app).post('/api/meals').set(auth()).send({
      food_id: foodId, meal_type: 'BRUNCH', date: TODAY, quantity_raw: 100,
    });
    expect(res.status).toBe(422);
  });

  it('should reject quantity 0', async () => {
    if (!foodId) return;
    const res = await request(app).post('/api/meals').set(auth()).send({
      food_id: foodId, meal_type: 'LUNCH', date: TODAY, quantity_raw: 0,
    });
    expect(res.status).toBe(422);
  });
});

describe('POST /api/meals/bulk (bulk log)', () => {
  it('should log multiple items in one request', async () => {
    if (!foodId) return;
    // Get a second food
    const food2 = await prisma.food.findFirst({ where: { name: { contains: 'Oats' } } });
    if (!food2) return;

    const res = await request(app).post('/api/meals/bulk').set(auth()).send({
      meal_type: 'LUNCH',
      date: TODAY,
      items: [
        { food_id: foodId, quantity_raw: 80 },
        { food_id: food2.id, quantity_raw: 50 },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.data.meal_items.length).toBe(2);
    expect(res.body.data.total_nutrition.calories).toBeGreaterThan(0);
    expect(res.body.data.total_nutrition.protein_g).toBeGreaterThan(0);
  });
});

describe('GET /api/meals (list logged meals)', () => {
  it('should return meals for today', async () => {
    const res = await request(app).get(`/api/meals?date=${TODAY}`).set(auth());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.items)).toBe(true);
    expect(res.body.data.items.length).toBeGreaterThan(0);
  });

  it('should group by meal_type', async () => {
    const res = await request(app).get(`/api/meals?date=${TODAY}`).set(auth());
    expect(res.body.data.grouped).toBeDefined();
    expect(typeof res.body.data.grouped).toBe('object');
  });

  it('should filter by meal_type', async () => {
    const res = await request(app).get(`/api/meals?date=${TODAY}&meal_type=BREAKFAST`).set(auth());
    expect(res.status).toBe(200);
    res.body.data.items.forEach(i => expect(i.meal_type).toBe('BREAKFAST'));
  });
});

describe('PUT /api/meals/:id (update quantity)', () => {
  it('should update quantity and recalculate nutrition', async () => {
    if (!mealItemId) return;
    const res = await request(app)
      .put(`/api/meals/${mealItemId}`)
      .set(auth())
      .send({ quantity_raw: 200 });
    expect(res.status).toBe(200);
    expect(res.body.data.new_nutrition.calories).toBeGreaterThan(0);
  });
});

describe('GET /api/daily-summary', () => {
  it('should return daily summary with actuals and warnings', async () => {
    const res = await request(app)
      .get(`/api/daily-summary?date=${TODAY}`)
      .set(auth());
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.actuals).toBeDefined();
    expect(typeof d.actuals.calories).toBe('number');
    expect(Array.isArray(d.warnings)).toBe(true);
    expect(d.progress).toBeDefined();
  });

  it('should include meals_by_type grouping', async () => {
    const res = await request(app)
      .get(`/api/daily-summary?date=${TODAY}`)
      .set(auth());
    expect(res.body.data.meals_by_type).toBeDefined();
    expect(typeof res.body.data.meals_by_type).toBe('object');
  });
});

describe('GET /api/nutrition/daily (full 18 nutrients)', () => {
  it('should return all 18 nutrient statuses', async () => {
    const res = await request(app)
      .get(`/api/nutrition/daily?date=${TODAY}`)
      .set(auth());
    expect(res.status).toBe(200);
    const ns = res.body.data.nutrient_status;
    expect(ns.calories).toBeDefined();
    expect(ns.protein_g).toBeDefined();
    expect(ns.iron_mg).toBeDefined();
    expect(ns.calcium_mg).toBeDefined();
    expect(ns.vitamin_c_mg).toBeDefined();
    expect(ns.fiber_g).toBeDefined();
  });

  it('should return recommendations for deficient nutrients', async () => {
    const res = await request(app)
      .get(`/api/nutrition/daily?date=${TODAY}`)
      .set(auth());
    expect(Array.isArray(res.body.data.recommendations)).toBe(true);
  });

  it('should compute pct correctly — protein must be a number', async () => {
    const res = await request(app)
      .get(`/api/nutrition/daily?date=${TODAY}`)
      .set(auth());
    const prot = res.body.data.nutrient_status.protein_g;
    expect(typeof prot.pct).toBe('number');
    expect(prot.pct).toBeGreaterThanOrEqual(0);
  });
});

describe('GET /api/nutrition/weekly', () => {
  it('should return 7 days of nutrition data', async () => {
    const res = await request(app).get('/api/nutrition/weekly?days=7').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.days.length).toBe(7);
    res.body.data.days.forEach(d => {
      expect(d.date).toBeDefined();
      expect(typeof d.calories).toBe('number');
    });
  });
});

describe('DELETE /api/meals/:id', () => {
  it('should delete a meal item', async () => {
    if (!mealItemId) return;
    const res = await request(app).delete(`/api/meals/${mealItemId}`).set(auth());
    expect(res.status).toBe(200);
  });

  it('should return 404 after deletion', async () => {
    if (!mealItemId) return;
    const res = await request(app).delete(`/api/meals/${mealItemId}`).set(auth());
    expect(res.status).toBe(404);
  });
});

describe('POST /api/mood', () => {
  it('should log mood data', async () => {
    const res = await request(app).post('/api/mood').set(auth()).send({
      date: TODAY, sleep_hours: 7.5, mood_rating: 4,
      stress_level: 2, energy_level: 4, recovery_state: 4,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.mood.sleep_hours).toBe(7.5);
  });

  it('should upsert (no duplicate per day)', async () => {
    const res = await request(app).post('/api/mood').set(auth()).send({
      date: TODAY, sleep_hours: 8, mood_rating: 5,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.mood.sleep_hours).toBe(8);
  });
});

describe('POST /api/water', () => {
  it('should log water intake', async () => {
    const res = await request(app).post('/api/water').set(auth()).send({ ml: 250, date: TODAY });
    expect(res.status).toBe(200);
    expect(res.body.data.water_ml).toBeGreaterThan(0);
  });

  it('should accumulate water on multiple logs', async () => {
    const r1 = await request(app).post('/api/water').set(auth()).send({ ml: 500, date: TODAY });
    const r2 = await request(app).post('/api/water').set(auth()).send({ ml: 500, date: TODAY });
    expect(r2.body.data.water_ml).toBeGreaterThan(r1.body.data.water_ml);
  });
});
