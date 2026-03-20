// tests/kitchen.test.js
'use strict';

const request = require('supertest');
const app     = require('../src/app');
const prisma  = require('../src/config/db');

let token  = null;
let userId = null;
let kitchenId = null;
let mealId    = null;
let orderId   = null;

beforeAll(async () => {
  const res = await request(app).post('/api/auth/register').send({
    email: `kitchen_test_${Date.now()}@test.com`,
    pin: '445566',
    name: 'Kitchen Tester',
  });
  token  = res.body.data.token;
  userId = res.body.data.user.id;

  // Get or create a test kitchen
  const kitchenRes = await request(app)
    .post('/api/kitchens')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: `Test Kitchen ${Date.now()}`,
      city: 'Bangalore',
      address: '1st Cross, JP Nagar, Bangalore - 560078',
      lat: 12.9081, lng: 77.5850,
      phone: '+91-80-1234-5678', email: 'test@kitchen.com',
      delivery_zones: ['560078', '560041'],
      max_capacity_per_day: 100,
    });
  kitchenId = kitchenRes.body.data.kitchen.id;
});

afterAll(async () => {
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  if (kitchenId) await prisma.cloudKitchen.delete({ where: { id: kitchenId } }).catch(() => {});
  await prisma.$disconnect();
});

const auth = () => ({ Authorization: `Bearer ${token}` });

describe('GET /api/kitchens', () => {
  it('should list kitchens without auth', async () => {
    const res = await request(app).get('/api/kitchens');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.kitchens)).toBe(true);
  });

  it('should filter by city', async () => {
    const res = await request(app).get('/api/kitchens?city=Bangalore');
    expect(res.status).toBe(200);
    res.body.data.kitchens.forEach(k => expect(k.city.toLowerCase()).toContain('bangalore'));
  });
});

describe('GET /api/kitchens/:id/status', () => {
  it('should return kitchen open/closed status', async () => {
    const res = await request(app).get(`/api/kitchens/${kitchenId}/status`);
    expect(res.status).toBe(200);
    expect(typeof res.body.data.is_open).toBe('boolean');
    expect(typeof res.body.data.capacity_remaining).toBe('number');
    expect(res.body.data.accepting_orders).toBeDefined();
  });
});

describe('POST /api/kitchen-meals', () => {
  it('should create a meal on the menu', async () => {
    const res = await request(app)
      .post('/api/kitchen-meals')
      .set(auth())
      .send({
        name: 'Test Protein Bowl',
        category: 'LUNCH',
        price_inr: 199,
        calories: 480, protein_g: 42, carbs_g: 48, fats_g: 10, fiber_g: 3,
        serving_weight: 400,
        is_vegetarian: false,
        description: 'High-protein bowl',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.meal.name).toBe('Test Protein Bowl');
    mealId = res.body.data.meal.id;
  });

  it('should reject meal without required fields', async () => {
    const res = await request(app)
      .post('/api/kitchen-meals')
      .set(auth())
      .send({ name: 'Incomplete Meal' });
    expect(res.status).toBe(422);
  });
});

describe('GET /api/kitchen-meals', () => {
  it('should list all meals', async () => {
    const res = await request(app).get('/api/kitchen-meals');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.meals)).toBe(true);
  });

  it('should filter by category', async () => {
    const res = await request(app).get('/api/kitchen-meals?category=LUNCH');
    expect(res.status).toBe(200);
    res.body.data.meals.forEach(m => expect(m.category).toBe('LUNCH'));
  });

  it('should filter vegetarian only', async () => {
    const res = await request(app).get('/api/kitchen-meals?vegetarian=true');
    expect(res.status).toBe(200);
    res.body.data.meals.forEach(m => expect(m.is_vegetarian).toBe(true));
  });
});

describe('POST /api/orders', () => {
  it('should place an order', async () => {
    if (!mealId) return;
    const res = await request(app)
      .post('/api/orders')
      .set(auth())
      .send({
        kitchen_id: kitchenId,
        items: [{ kitchen_meal_id: mealId, quantity: 1, meal_type: 'LUNCH' }],
        delivery_address: '100 Test Street, Bangalore',
        delivery_lat: 12.9081, delivery_lng: 77.5850,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.total_inr).toBe(199);
    expect(res.body.data.estimated_delivery_min).toBe(45);
    orderId = res.body.data.order.id;
  });

  it('should reject order with missing kitchen_id', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set(auth())
      .send({ items: [], delivery_address: 'test' });
    expect(res.status).toBe(422);
  });
});

describe('GET /api/orders/:id', () => {
  it('should return order with items and delivery', async () => {
    if (!orderId) return;
    const res = await request(app).get(`/api/orders/${orderId}`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.order.status).toBe('PENDING');
    expect(res.body.data.order.order_items.length).toBe(1);
    expect(res.body.data.order.delivery).toBeDefined();
  });

  it('should not return another user\'s order', async () => {
    const other = await request(app).post('/api/auth/register').send({
      email: `other_${Date.now()}@test.com`, pin: '111222', name: 'Other',
    });
    const otherToken = other.body.data.token;
    if (!orderId) return;
    const res = await request(app)
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/orders/:id/track', () => {
  it('should return tracking info with ETA', async () => {
    if (!orderId) return;
    const res = await request(app).get(`/api/orders/${orderId}/track`).set(auth());
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.status).toBeDefined();
    expect(d.message).toBeDefined();
    expect(typeof d.eta_minutes).toBe('number');
  });
});

describe('PATCH /api/orders/:id/status (kitchen staff)', () => {
  it('should update order status to CONFIRMED', async () => {
    if (!orderId) return;
    const res = await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set(auth())
      .send({ status: 'CONFIRMED' });
    expect(res.status).toBe(200);
    expect(res.body.data.order.status).toBe('CONFIRMED');
  });

  it('should update to PREPARING', async () => {
    if (!orderId) return;
    const res = await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set(auth())
      .send({ status: 'PREPARING' });
    expect(res.status).toBe(200);
  });
});

describe('POST /api/orders/:id/cancel', () => {
  it('should not cancel an order in PREPARING state', async () => {
    if (!orderId) return;
    const res = await request(app).post(`/api/orders/${orderId}/cancel`).set(auth());
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Cannot cancel');
  });
});

describe('GET /api/kitchens/:id/orders (order queue)', () => {
  it('should return kitchen order queue', async () => {
    const res = await request(app)
      .get(`/api/kitchens/${kitchenId}/orders`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.orders)).toBe(true);
  });
});

describe('POST /api/subscriptions', () => {
  it('should create a weekly subscription', async () => {
    const res = await request(app)
      .post('/api/subscriptions')
      .set(auth())
      .send({
        plan_name: 'High-Protein Weekly',
        plan: 'WEEKLY',
        meals_per_day: 2,
        price_inr: 1200,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.subscription.status).toBe('ACTIVE');
    expect(res.body.data.subscription.plan).toBe('WEEKLY');
  });
});

describe('GET /api/subscriptions', () => {
  it('should list user subscriptions', async () => {
    const res = await request(app).get('/api/subscriptions').set(auth());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.subscriptions)).toBe(true);
    expect(res.body.data.subscriptions.length).toBeGreaterThan(0);
  });
});

describe('POST /api/webhooks/delivery', () => {
  it('should handle delivery webhook without auth', async () => {
    if (!orderId) return;
    const res = await request(app)
      .post('/api/webhooks/delivery')
      .send({
        platform: 'swiggy',
        order_id: orderId,
        status: 'picked_up',
        rider_name: 'Ravi Kumar',
        rider_phone: '+91-9999888877',
        rider_lat: 12.9100,
        rider_lng: 77.5900,
      });
    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
  });
});

describe('POST /api/kitchen-meals/:id/reviews (after delivery)', () => {
  it('should require delivered order to submit review', async () => {
    if (!orderId || !mealId) return;
    // Order is still in PREPARING — should fail
    const res = await request(app)
      .post('/api/reviews')
      .set(auth())
      .send({
        order_id: orderId,
        kitchen_meal_id: mealId,
        rating: 5,
        taste_rating: 5,
        review_text: 'Excellent!',
      });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('delivered');
  });
});
