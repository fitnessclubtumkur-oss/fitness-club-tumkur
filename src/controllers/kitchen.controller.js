// src/controllers/kitchen.controller.js
// Phase 1C — Cloud Kitchen: setup, meals, orders, delivery, auto-logging, reviews
'use strict';

const prisma = require('../config/db');
const { success, created, error, notFound, forbidden } = require('../utils/response');
const logger = require('../utils/logger');

// ─── KITCHEN MANAGEMENT ──────────────────────────────────────────────────────

async function registerKitchen(req, res) {
  try {
    const data = req.body;
    const kitchen = await prisma.cloudKitchen.create({ data });
    logger.info({ kitchenId: kitchen.id }, 'Kitchen registered');
    return created(res, { kitchen }, 'Kitchen registered successfully');
  } catch (err) {
    logger.error({ err }, 'Register kitchen error');
    throw err;
  }
}

async function listKitchens(req, res) {
  try {
    const { city, pincode } = req.query;
    const where = { is_active: true };
    if (city) where.city = { contains: city, mode: 'insensitive' };

    const kitchens = await prisma.cloudKitchen.findMany({
      where,
      select: {
        id: true, name: true, city: true, address: true,
        lat: true, lng: true, phone: true,
        operational_hours_open: true, operational_hours_close: true,
        max_capacity_per_day: true, delivery_zones: true, pickup_available: true,
      },
      orderBy: { name: 'asc' },
    });

    // Filter by pincode if provided
    const filtered = pincode
      ? kitchens.filter(k => Array.isArray(k.delivery_zones) && k.delivery_zones.includes(pincode))
      : kitchens;

    return success(res, { kitchens: filtered, count: filtered.length });
  } catch (err) {
    logger.error({ err }, 'List kitchens error');
    throw err;
  }
}

async function getKitchen(req, res) {
  try {
    const kitchen = await prisma.cloudKitchen.findUnique({
      where: { id: req.params.id },
    });
    if (!kitchen) return notFound(res, 'Kitchen not found');
    return success(res, { kitchen });
  } catch (err) {
    logger.error({ err }, 'Get kitchen error');
    throw err;
  }
}

async function getKitchenStatus(req, res) {
  try {
    const kitchen = await prisma.cloudKitchen.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true, is_active: true, operational_hours_open: true, operational_hours_close: true, max_capacity_per_day: true },
    });
    if (!kitchen) return notFound(res, 'Kitchen not found');

    const now = new Date();
    const timeStr = now.toTimeString().slice(0, 5); // HH:MM
    const isOpen = timeStr >= kitchen.operational_hours_open && timeStr <= kitchen.operational_hours_close;

    const todayOrderCount = await prisma.order.count({
      where: {
        kitchen_id: kitchen.id,
        created_at: { gte: new Date(now.setHours(0, 0, 0, 0)) },
        status: { notIn: ['CANCELLED', 'REFUNDED'] },
      },
    });

    return success(res, {
      kitchen_id: kitchen.id,
      name: kitchen.name,
      is_open: isOpen && kitchen.is_active,
      current_time: timeStr,
      hours: `${kitchen.operational_hours_open} – ${kitchen.operational_hours_close}`,
      capacity_used: todayOrderCount,
      capacity_remaining: Math.max(0, kitchen.max_capacity_per_day - todayOrderCount),
      accepting_orders: isOpen && kitchen.is_active && todayOrderCount < kitchen.max_capacity_per_day,
    });
  } catch (err) {
    logger.error({ err }, 'Kitchen status error');
    throw err;
  }
}

// ─── KITCHEN MEALS MENU ───────────────────────────────────────────────────────

async function listMeals(req, res) {
  try {
    const { category, vegetarian, vegan, max_calories, search } = req.query;
    const where = { is_active: true };

    if (category) where.category = category.toUpperCase();
    if (vegetarian === 'true') where.is_vegetarian = true;
    if (vegan === 'true') where.is_vegan = true;
    if (max_calories) where.calories = { lte: parseFloat(max_calories) };
    if (search) where.name = { contains: search, mode: 'insensitive' };

    const meals = await prisma.kitchenMeal.findMany({
      where,
      orderBy: [{ category: 'asc' }, { avg_rating: 'desc' }],
    });

    // Group by category
    const grouped = meals.reduce((acc, meal) => {
      if (!acc[meal.category]) acc[meal.category] = [];
      acc[meal.category].push(meal);
      return acc;
    }, {});

    return success(res, { meals, grouped, total: meals.length });
  } catch (err) {
    logger.error({ err }, 'List meals error');
    throw err;
  }
}

async function getMeal(req, res) {
  try {
    const meal = await prisma.kitchenMeal.findUnique({
      where: { id: req.params.id },
      include: {
        meal_reviews: {
          orderBy: { created_at: 'desc' },
          take: 10,
          include: { user: { select: { name: true } } },
        },
      },
    });
    if (!meal) return notFound(res, 'Meal not found');
    return success(res, { meal });
  } catch (err) {
    logger.error({ err }, 'Get meal error');
    throw err;
  }
}

async function createMeal(req, res) {
  try {
    const meal = await prisma.kitchenMeal.create({ data: req.body });
    return created(res, { meal }, 'Meal added to menu');
  } catch (err) {
    logger.error({ err }, 'Create meal error');
    throw err;
  }
}

async function updateMeal(req, res) {
  try {
    const meal = await prisma.kitchenMeal.update({
      where: { id: req.params.id },
      data: req.body,
    });
    return success(res, { meal }, 'Meal updated');
  } catch (err) {
    logger.error({ err }, 'Update meal error');
    throw err;
  }
}

// ─── ORDERS ───────────────────────────────────────────────────────────────────

async function placeOrder(req, res) {
  try {
    const { kitchen_id, items, delivery_address, delivery_lat, delivery_lng, scheduled_at, special_notes } = req.body;
    // items: [{ kitchen_meal_id, quantity, meal_type }]
    const userId = req.user.id;

    // Validate kitchen is open
    const kitchen = await prisma.cloudKitchen.findUnique({ where: { id: kitchen_id } });
    if (!kitchen || !kitchen.is_active) return error(res, 'Kitchen not available');

    // Fetch meal prices & validate
    let totalInr = 0;
    const orderItems = [];
    for (const item of items) {
      const meal = await prisma.kitchenMeal.findUnique({ where: { id: item.kitchen_meal_id } });
      if (!meal || !meal.is_active) return error(res, `Meal ${item.kitchen_meal_id} not available`);
      totalInr += meal.price_inr * item.quantity;
      orderItems.push({
        kitchen_meal_id: item.kitchen_meal_id,
        quantity: item.quantity,
        price_inr: meal.price_inr,
        meal_type: item.meal_type,
      });
    }

    // Generate delivery OTP
    const otp = Math.floor(1000 + Math.random() * 9000).toString();

    const order = await prisma.order.create({
      data: {
        user_id: userId,
        kitchen_id,
        total_inr: totalInr,
        delivery_address,
        delivery_lat,
        delivery_lng,
        scheduled_at: scheduled_at ? new Date(scheduled_at) : null,
        special_notes,
        otp,
        status: 'PENDING',
        order_items: { create: orderItems },
        delivery: {
          create: { status: 'SCHEDULED' },
        },
      },
      include: {
        order_items: { include: { kitchen_meal: { select: { name: true, calories: true, protein_g: true } } } },
        delivery: true,
      },
    });

    logger.info({ orderId: order.id, userId, totalInr }, 'Order placed');
    return created(res, {
      order: { ...order, otp: undefined }, // don't expose OTP in response
      total_inr: totalInr,
      estimated_delivery_min: 45,
    }, 'Order placed successfully');
  } catch (err) {
    logger.error({ err }, 'Place order error');
    throw err;
  }
}

async function getOrder(req, res) {
  try {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, user_id: req.user.id },
      include: {
        order_items: {
          include: { kitchen_meal: { select: { id: true, name: true, image_url: true, calories: true, protein_g: true, price_inr: true } } },
        },
        delivery: true,
        kitchen: { select: { name: true, address: true, phone: true } },
      },
    });
    if (!order) return notFound(res, 'Order not found');
    return success(res, { order });
  } catch (err) {
    logger.error({ err }, 'Get order error');
    throw err;
  }
}

async function listOrders(req, res) {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const where = { user_id: req.user.id };
    if (status) where.status = status.toUpperCase();

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          order_items: {
            include: { kitchen_meal: { select: { name: true, image_url: true } } },
          },
          kitchen: { select: { name: true, city: true } },
          delivery: { select: { status: true, delivered_at: true } },
        },
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: parseInt(limit),
      }),
      prisma.order.count({ where }),
    ]);

    return success(res, { orders, total, page: parseInt(page) });
  } catch (err) {
    logger.error({ err }, 'List orders error');
    throw err;
  }
}

async function cancelOrder(req, res) {
  try {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, user_id: req.user.id },
    });
    if (!order) return notFound(res, 'Order not found');
    if (!['PENDING', 'CONFIRMED'].includes(order.status)) {
      return error(res, `Cannot cancel order in ${order.status} status`);
    }

    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'CANCELLED' },
    });

    return success(res, {}, 'Order cancelled');
  } catch (err) {
    logger.error({ err }, 'Cancel order error');
    throw err;
  }
}

// ─── DELIVERY TRACKING ────────────────────────────────────────────────────────

async function trackDelivery(req, res) {
  try {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, user_id: req.user.id },
      include: {
        delivery: true,
        kitchen: { select: { name: true, lat: true, lng: true, address: true } },
      },
    });
    if (!order) return notFound(res, 'Order not found');

    const statusMessages = {
      PENDING:          'Order received — awaiting confirmation',
      CONFIRMED:        'Order confirmed — kitchen is preparing your meal',
      PREPARING:        '👨‍🍳 Your meal is being freshly prepared',
      READY:            '✅ Meal ready — rider being assigned',
      OUT_FOR_DELIVERY: '🛵 Rider is on the way!',
      DELIVERED:        '🎉 Delivered! Enjoy your meal',
      CANCELLED:        'Order cancelled',
    };

    const etaMinutes = {
      PENDING: 55, CONFIRMED: 50, PREPARING: 35,
      READY: 20, OUT_FOR_DELIVERY: 10, DELIVERED: 0,
    };

    return success(res, {
      order_id:     order.id,
      status:       order.status,
      message:      statusMessages[order.status] || order.status,
      eta_minutes:  etaMinutes[order.status] ?? null,
      delivery: {
        status:       order.delivery?.status,
        rider_name:   order.delivery?.rider_name,
        rider_phone:  order.delivery?.rider_phone,
        rider_lat:    order.delivery?.rider_lat,
        rider_lng:    order.delivery?.rider_lng,
        photo_url:    order.delivery?.photo_url,
        delivered_at: order.delivery?.delivered_at,
      },
      kitchen: {
        name:    order.kitchen.name,
        address: order.kitchen.address,
        lat:     order.kitchen.lat,
        lng:     order.kitchen.lng,
      },
      scheduled_at: order.scheduled_at,
    });
  } catch (err) {
    logger.error({ err }, 'Track delivery error');
    throw err;
  }
}

async function updateDeliveryStatus(req, res) {
  try {
    // Called by delivery partner app / webhook
    const { order_id, status, rider_name, rider_phone, rider_lat, rider_lng, photo_url } = req.body;

    const order = await prisma.order.findUnique({ where: { id: order_id } });
    if (!order) return notFound(res, 'Order not found');

    // Map delivery status to order status
    const orderStatusMap = {
      PICKED_UP:    'OUT_FOR_DELIVERY',
      IN_TRANSIT:   'OUT_FOR_DELIVERY',
      DELIVERED:    'DELIVERED',
      FAILED:       'PENDING',
    };

    await prisma.$transaction([
      prisma.delivery.update({
        where: { order_id },
        data: {
          status,
          rider_name,
          rider_phone,
          rider_lat,
          rider_lng,
          photo_url,
          ...(status === 'PICKED_UP' ? { picked_up_at: new Date() } : {}),
          ...(status === 'DELIVERED' ? { delivered_at: new Date() } : {}),
        },
      }),
      prisma.order.update({
        where: { id: order_id },
        data: {
          status: orderStatusMap[status] || order.status,
          ...(status === 'DELIVERED' ? { delivered_at: new Date() } : {}),
        },
      }),
    ]);

    return success(res, {}, 'Delivery status updated');
  } catch (err) {
    logger.error({ err }, 'Update delivery status error');
    throw err;
  }
}

async function verifyDeliveryOTP(req, res) {
  try {
    const { otp } = req.body;
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, user_id: req.user.id },
    });
    if (!order) return notFound(res, 'Order not found');
    if (order.otp !== otp) return error(res, 'Invalid OTP');
    if (order.status === 'DELIVERED') return error(res, 'Order already delivered');

    await prisma.$transaction([
      prisma.order.update({ where: { id: order.id }, data: { status: 'DELIVERED', delivered_at: new Date() } }),
      prisma.delivery.update({ where: { order_id: order.id }, data: { status: 'DELIVERED', delivered_at: new Date() } }),
    ]);

    return success(res, { order_id: order.id }, 'Delivery confirmed ✅');
  } catch (err) {
    logger.error({ err }, 'OTP verify error');
    throw err;
  }
}

// ─── AUTO-LOG DELIVERED MEALS ─────────────────────────────────────────────────

async function autoLogDeliveredMeal(req, res) {
  try {
    const { order_id, meal_id, delivery_date, meal_type } = req.body;
    const userId = req.user.id;

    // Verify the order belongs to this user
    const order = await prisma.order.findFirst({
      where: { id: order_id, user_id: userId },
      include: { order_items: { include: { kitchen_meal: true } } },
    });
    if (!order) return notFound(res, 'Order not found');

    // Find the specific meal in the order
    const orderItem = order.order_items.find(i => i.kitchen_meal_id === meal_id);
    if (!orderItem) return error(res, 'Meal not found in this order');

    const km = orderItem.kitchen_meal;
    const logDate = delivery_date ? new Date(delivery_date) : new Date();
    logDate.setHours(0, 0, 0, 0);

    // Check if already auto-logged to avoid duplicates
    const existing = await prisma.mealItem.findFirst({
      where: { user_id: userId, order_id, food_id: { not: undefined } },
    });
    if (existing) return error(res, 'Meal already logged for this order');

    // We need a food entry — try to find by kitchen meal name, else create synthetic entry
    let foodId = null;
    const matchedFood = await prisma.food.findFirst({
      where: { name: { contains: km.name.split(' ')[0], mode: 'insensitive' } },
    });
    foodId = matchedFood?.id;

    // If no food match, create a temporary food record with exact kitchen meal macros
    if (!foodId) {
      const tempFood = await prisma.food.create({
        data: {
          name: `[Kitchen] ${km.name}`,
          category: 'PREPARED',
          calories: (km.calories / km.serving_weight) * 100,
          protein_g: (km.protein_g / km.serving_weight) * 100,
          carbs_g: (km.carbs_g / km.serving_weight) * 100,
          fats_g: (km.fats_g / km.serving_weight) * 100,
          fiber_g: (km.fiber_g / km.serving_weight) * 100,
        },
      });
      foodId = tempFood.id;
    }

    // Log the meal item
    const mealItem = await prisma.mealItem.create({
      data: {
        user_id: userId,
        food_id: foodId,
        meal_type: meal_type || 'LUNCH',
        date: logDate,
        quantity_raw: km.serving_weight,
        unit: 'GRAMS',
        order_id,
        auto_logged: true,
        calories:  km.calories,
        protein_g: km.protein_g,
        carbs_g:   km.carbs_g,
        fats_g:    km.fats_g,
        fiber_g:   km.fiber_g,
      },
    });

    // Update daily summary
    await prisma.dailySummary.upsert({
      where: { user_id_date: { user_id: userId, date: logDate } },
      create: {
        user_id: userId, date: logDate,
        total_calories_consumed: km.calories,
        total_protein_g: km.protein_g,
        total_carbs_g: km.carbs_g,
        total_fats_g: km.fats_g,
        total_fiber_g: km.fiber_g,
      },
      update: {
        total_calories_consumed: { increment: km.calories },
        total_protein_g: { increment: km.protein_g },
        total_carbs_g: { increment: km.carbs_g },
        total_fats_g: { increment: km.fats_g },
        total_fiber_g: { increment: km.fiber_g },
      },
    });

    logger.info({ userId, orderId: order_id, mealName: km.name }, 'Meal auto-logged');
    return created(res, {
      meal_item: mealItem,
      meal_name: km.name,
      nutrition: { calories: km.calories, protein_g: km.protein_g, carbs_g: km.carbs_g, fats_g: km.fats_g },
    }, `${km.name} logged to your nutrition tracker ✅`);
  } catch (err) {
    logger.error({ err }, 'Auto-log meal error');
    throw err;
  }
}

// ─── MEAL REVIEWS ─────────────────────────────────────────────────────────────

async function submitReview(req, res) {
  try {
    const { order_id, kitchen_meal_id, rating, taste_rating, freshness_rating, packaging_rating, delivery_rating, would_reorder, review_text } = req.body;
    const userId = req.user.id;

    // Ensure user ordered this meal
    const order = await prisma.order.findFirst({
      where: { id: order_id, user_id: userId, status: 'DELIVERED' },
      include: { order_items: true },
    });
    if (!order) return error(res, 'Can only review delivered orders');

    const validItem = order.order_items.find(i => i.kitchen_meal_id === kitchen_meal_id);
    if (!validItem) return error(res, 'Meal not found in this order');

    const review = await prisma.mealReview.create({
      data: {
        user_id: userId, kitchen_meal_id, order_id,
        rating, taste_rating, freshness_rating, packaging_rating, delivery_rating,
        would_reorder, review_text,
      },
    });

    // Recalculate meal average rating
    const allReviews = await prisma.mealReview.aggregate({
      where: { kitchen_meal_id },
      _avg: { rating: true },
      _count: { rating: true },
    });
    await prisma.kitchenMeal.update({
      where: { id: kitchen_meal_id },
      data: {
        avg_rating: Math.round((allReviews._avg.rating || 0) * 10) / 10,
        review_count: allReviews._count.rating,
      },
    });

    return created(res, { review }, 'Review submitted — thank you!');
  } catch (err) {
    logger.error({ err }, 'Submit review error');
    throw err;
  }
}

async function getMealReviews(req, res) {
  try {
    const { meal_id } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const [reviews, stats] = await Promise.all([
      prisma.mealReview.findMany({
        where: { kitchen_meal_id: meal_id },
        include: { user: { select: { name: true } } },
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: parseInt(limit),
      }),
      prisma.mealReview.aggregate({
        where: { kitchen_meal_id: meal_id },
        _avg: { rating: true, taste_rating: true, freshness_rating: true, packaging_rating: true },
        _count: { rating: true },
      }),
    ]);

    return success(res, {
      reviews,
      stats: {
        avg_rating:      Math.round((stats._avg.rating || 0) * 10) / 10,
        avg_taste:       Math.round((stats._avg.taste_rating || 0) * 10) / 10,
        avg_freshness:   Math.round((stats._avg.freshness_rating || 0) * 10) / 10,
        avg_packaging:   Math.round((stats._avg.packaging_rating || 0) * 10) / 10,
        total_reviews:   stats._count.rating,
      },
      page: parseInt(page),
    });
  } catch (err) {
    logger.error({ err }, 'Get meal reviews error');
    throw err;
  }
}

// ─── SUBSCRIPTIONS ────────────────────────────────────────────────────────────

async function createSubscription(req, res) {
  try {
    const { plan_name, plan, meals_per_day, price_inr } = req.body;
    const userId = req.user.id;

    const nextBilling = new Date();
    if (plan === 'WEEKLY')  nextBilling.setDate(nextBilling.getDate() + 7);
    if (plan === 'MONTHLY') nextBilling.setMonth(nextBilling.getMonth() + 1);
    if (plan === 'DAILY')   nextBilling.setDate(nextBilling.getDate() + 1);

    const subscription = await prisma.subscription.create({
      data: {
        user_id: userId,
        plan_name, plan,
        meals_per_day: meals_per_day || 3,
        price_inr,
        next_billing_date: nextBilling,
        status: 'ACTIVE',
      },
    });

    return created(res, { subscription }, 'Subscription created');
  } catch (err) {
    logger.error({ err }, 'Create subscription error');
    throw err;
  }
}

async function getSubscriptions(req, res) {
  try {
    const subs = await prisma.subscription.findMany({
      where: { user_id: req.user.id },
      orderBy: { started_at: 'desc' },
    });
    return success(res, { subscriptions: subs });
  } catch (err) {
    logger.error({ err }, 'Get subscriptions error');
    throw err;
  }
}

async function pauseSubscription(req, res) {
  try {
    const { pause_from_date, pause_until_date } = req.body;
    const sub = await prisma.subscription.findFirst({
      where: { id: req.params.id, user_id: req.user.id, status: 'ACTIVE' },
    });
    if (!sub) return notFound(res, 'Active subscription not found');

    const updated = await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        status: 'PAUSED',
        pause_from_date: new Date(pause_from_date),
        pause_until_date: new Date(pause_until_date),
      },
    });
    return success(res, { subscription: updated }, 'Subscription paused');
  } catch (err) {
    logger.error({ err }, 'Pause subscription error');
    throw err;
  }
}

async function resumeSubscription(req, res) {
  try {
    const sub = await prisma.subscription.findFirst({
      where: { id: req.params.id, user_id: req.user.id, status: 'PAUSED' },
    });
    if (!sub) return notFound(res, 'Paused subscription not found');

    const updated = await prisma.subscription.update({
      where: { id: sub.id },
      data: { status: 'ACTIVE', pause_from_date: null, pause_until_date: null },
    });
    return success(res, { subscription: updated }, 'Subscription resumed');
  } catch (err) {
    logger.error({ err }, 'Resume subscription error');
    throw err;
  }
}

async function cancelSubscription(req, res) {
  try {
    const sub = await prisma.subscription.findFirst({
      where: { id: req.params.id, user_id: req.user.id, status: { in: ['ACTIVE', 'PAUSED'] } },
    });
    if (!sub) return notFound(res, 'Subscription not found');

    const updated = await prisma.subscription.update({
      where: { id: sub.id },
      data: { status: 'CANCELLED', cancelled_at: new Date() },
    });
    return success(res, { subscription: updated }, 'Subscription cancelled');
  } catch (err) {
    logger.error({ err }, 'Cancel subscription error');
    throw err;
  }
}

// ─── KITCHEN STAFF ORDER QUEUE ────────────────────────────────────────────────

async function getOrderQueue(req, res) {
  try {
    const { kitchen_id } = req.params;
    const { status } = req.query;

    const where = { kitchen_id };
    if (status) {
      where.status = status.toUpperCase();
    } else {
      where.status = { in: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY'] };
    }

    const orders = await prisma.order.findMany({
      where,
      include: {
        order_items: {
          include: { kitchen_meal: { select: { id: true, name: true, category: true } } },
        },
        user: { select: { name: true, phone: true } },
        delivery: { select: { status: true, rider_name: true } },
      },
      orderBy: [
        { scheduled_at: 'asc' },
        { created_at: 'asc' },
      ],
    });

    return success(res, { orders, count: orders.length });
  } catch (err) {
    logger.error({ err }, 'Get order queue error');
    throw err;
  }
}

async function updateOrderStatus(req, res) {
  try {
    const { status } = req.body;
    const validStatuses = ['CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'];
    if (!validStatuses.includes(status)) return error(res, 'Invalid status');

    const order = await prisma.order.update({
      where: { id: req.params.id },
      data: { status },
    });

    return success(res, { order }, `Order status updated to ${status}`);
  } catch (err) {
    logger.error({ err }, 'Update order status error');
    throw err;
  }
}

// ─── SWIGGY / ZOMATO WEBHOOK ──────────────────────────────────────────────────

async function handleDeliveryWebhook(req, res) {
  try {
    const { platform, order_id, status, rider_name, rider_phone, rider_lat, rider_lng, estimated_arrival } = req.body;
    logger.info({ platform, order_id, status }, 'Delivery webhook received');

    // Find order by ID (platform order_id may differ — for now use direct mapping)
    const order = await prisma.order.findUnique({ where: { id: order_id } });
    if (!order) {
      logger.warn({ order_id }, 'Webhook: order not found');
      return res.status(200).json({ received: true }); // Always 200 to platform
    }

    const statusMap = {
      'order_placed':      'CONFIRMED',
      'order_accepted':    'CONFIRMED',
      'preparing':         'PREPARING',
      'ready_for_pickup':  'READY',
      'picked_up':         'OUT_FOR_DELIVERY',
      'out_for_delivery':  'OUT_FOR_DELIVERY',
      'delivered':         'DELIVERED',
      'cancelled':         'CANCELLED',
    };

    const mappedStatus = statusMap[status?.toLowerCase()];
    if (mappedStatus) {
      await prisma.order.update({
        where: { id: order_id },
        data: { status: mappedStatus, ...(mappedStatus === 'DELIVERED' ? { delivered_at: new Date() } : {}) },
      });

      if (rider_name || rider_lat) {
        await prisma.delivery.update({
          where: { order_id },
          data: {
            rider_name, rider_phone, rider_lat, rider_lng,
            status: mappedStatus === 'DELIVERED' ? 'DELIVERED' : mappedStatus === 'OUT_FOR_DELIVERY' ? 'IN_TRANSIT' : 'SCHEDULED',
            ...(mappedStatus === 'DELIVERED' ? { delivered_at: new Date() } : {}),
            ...(mappedStatus === 'OUT_FOR_DELIVERY' ? { picked_up_at: new Date() } : {}),
          },
        }).catch(() => {});
      }
    }

    return res.status(200).json({ received: true, processed: !!mappedStatus });
  } catch (err) {
    logger.error({ err }, 'Webhook error');
    return res.status(200).json({ received: true }); // Never fail webhooks
  }
}

// ─── INGREDIENT INVENTORY ────────────────────────────────────────────────────

async function getInventory(req, res) {
  try {
    const inventory = await prisma.ingredientInventory.findMany({
      where: { kitchen_id: req.params.kitchen_id },
      orderBy: { ingredient: 'asc' },
    });

    const lowStock = inventory.filter(i => i.stock_kg <= i.min_stock_kg);

    return success(res, { inventory, low_stock_alerts: lowStock, total_items: inventory.length });
  } catch (err) {
    logger.error({ err }, 'Get inventory error');
    throw err;
  }
}

async function updateInventory(req, res) {
  try {
    const { ingredient, stock_kg, min_stock_kg } = req.body;
    const { kitchen_id } = req.params;

    const item = await prisma.ingredientInventory.upsert({
      where: { kitchen_id_ingredient: { kitchen_id, ingredient } },
      create: { kitchen_id, ingredient, stock_kg, min_stock_kg: min_stock_kg || 5 },
      update: { stock_kg, ...(min_stock_kg ? { min_stock_kg } : {}) },
    });

    return success(res, { item });
  } catch (err) {
    logger.error({ err }, 'Update inventory error');
    throw err;
  }
}

module.exports = {
  registerKitchen, listKitchens, getKitchen, getKitchenStatus,
  listMeals, getMeal, createMeal, updateMeal,
  placeOrder, getOrder, listOrders, cancelOrder,
  trackDelivery, updateDeliveryStatus, verifyDeliveryOTP,
  autoLogDeliveredMeal,
  submitReview, getMealReviews,
  createSubscription, getSubscriptions, pauseSubscription, resumeSubscription, cancelSubscription,
  getOrderQueue, updateOrderStatus,
  handleDeliveryWebhook,
  getInventory, updateInventory,
};
