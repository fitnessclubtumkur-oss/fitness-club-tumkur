// src/utils/calc.js
'use strict';

/**
 * Mifflin-St Jeor BMR formula
 * @param {string} gender MALE | FEMALE
 * @param {number} weightKg
 * @param {number} heightCm
 * @param {number} age
 */
function calculateBMR(gender, weightKg, heightCm, age) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return gender === 'MALE' ? base + 5 : base - 161;
}

const ACTIVITY_MULTIPLIERS = {
  SEDENTARY:   1.2,
  LIGHT:       1.375,
  MODERATE:    1.55,
  ACTIVE:      1.725,
  VERY_ACTIVE: 1.9,
};

/**
 * Calculate TDEE (Total Daily Energy Expenditure)
 */
function calculateTDEE(gender, weightKg, heightCm, age, activityLevel = 'MODERATE') {
  const bmr = calculateBMR(gender, weightKg, heightCm, age);
  const multiplier = ACTIVITY_MULTIPLIERS[activityLevel] || 1.55;
  return Math.round(bmr * multiplier);
}

/**
 * Calculate macro targets based on goal and TDEE
 * Returns { calories, protein_g, carbs_g, fats_g }
 */
function calculateMacroTargets(goal, weightKg, tdee) {
  let calories = tdee;
  let proteinRatio, carbsRatio, fatsRatio;

  switch (goal) {
    case 'WEIGHT_LOSS':
      calories = Math.round(tdee * 0.8);   // 20% deficit
      proteinRatio = 0.35;
      carbsRatio   = 0.35;
      fatsRatio    = 0.30;
      break;
    case 'MUSCLE_GAIN':
      calories = Math.round(tdee * 1.1);   // 10% surplus
      proteinRatio = 0.30;
      carbsRatio   = 0.45;
      fatsRatio    = 0.25;
      break;
    case 'MAINTENANCE':
    default:
      proteinRatio = 0.25;
      carbsRatio   = 0.50;
      fatsRatio    = 0.25;
      break;
    case 'ENDURANCE':
      proteinRatio = 0.20;
      carbsRatio   = 0.60;
      fatsRatio    = 0.20;
      break;
    case 'GENERAL_FITNESS':
      proteinRatio = 0.25;
      carbsRatio   = 0.50;
      fatsRatio    = 0.25;
      break;
  }

  return {
    calories,
    protein_g: Math.round((calories * proteinRatio) / 4),  // 4 kcal/g
    carbs_g:   Math.round((calories * carbsRatio)   / 4),
    fats_g:    Math.round((calories * fatsRatio)    / 9),  // 9 kcal/g
    fiber_g:   25,
  };
}

// MET values for calorie burn calculation
const MET_VALUES = {
  CARDIO:     { LOW: 5, MODERATE: 7, HIGH: 10, VERY_HIGH: 14 },
  AEROBICS:   { LOW: 4, MODERATE: 6, HIGH: 8,  VERY_HIGH: 10 },
  YOGA:       { LOW: 2.5, MODERATE: 3, HIGH: 4, VERY_HIGH: 5 },
  RESISTANCE: { LOW: 3, MODERATE: 4, HIGH: 5,  VERY_HIGH: 6 },
  RUNNING:    { LOW: 7, MODERATE: 9, HIGH: 11, VERY_HIGH: 14 },
  TREKKING:   { LOW: 4, MODERATE: 6, HIGH: 7,  VERY_HIGH: 9 },
};

/**
 * Calculate calories burned during a workout
 * Formula: MET × weight_kg × (duration_min / 60)
 */
function calculateCaloriesBurned(type, weightKg, durationMin, intensity = 'MODERATE', elevationM = 0) {
  const metMap = MET_VALUES[type] || MET_VALUES.CARDIO;
  const met = metMap[intensity] || metMap.MODERATE;
  let calories = met * weightKg * (durationMin / 60);

  // Elevation bonus for trekking/running: +10% per 500m elevation
  if (elevationM > 0) {
    calories *= 1 + (elevationM / 500) * 0.1;
  }

  return Math.round(calories);
}

/**
 * Calculate nutrition values for a food item given raw weight
 * @param {Object} food - food record from DB (per 100g)
 * @param {number} quantityRaw - grams/ml of raw food
 */
function calculateFoodNutrition(food, quantityRaw) {
  const factor = quantityRaw / 100;
  return {
    calories:    Math.round(food.calories    * factor * 10) / 10,
    protein_g:   Math.round(food.protein_g   * factor * 10) / 10,
    carbs_g:     Math.round(food.carbs_g     * factor * 10) / 10,
    fats_g:      Math.round(food.fats_g      * factor * 10) / 10,
    fiber_g:     Math.round(food.fiber_g     * factor * 10) / 10,
    sodium_mg:   Math.round(food.sodium_mg   * factor * 10) / 10,
    calcium_mg:  Math.round(food.calcium_mg  * factor * 10) / 10,
    iron_mg:     Math.round(food.iron_mg     * factor * 10) / 10,
    vitamin_c_mg: Math.round(food.vitamin_c_mg * factor * 10) / 10,
    zinc_mg:     Math.round(food.zinc_mg     * factor * 10) / 10,
  };
}

/**
 * Calculate running pace (min/km) from distance and duration
 */
function calculatePace(distanceKm, durationMin) {
  if (!distanceKm || !durationMin) return null;
  return (durationMin / distanceKm).toFixed(2);
}

module.exports = {
  calculateBMR,
  calculateTDEE,
  calculateMacroTargets,
  calculateCaloriesBurned,
  calculateFoodNutrition,
  calculatePace,
};
