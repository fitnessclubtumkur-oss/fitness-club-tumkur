// prisma/seed.js
'use strict';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ─── 100+ Indian Foods (all values per 100g / 100ml RAW) ─────────────────────
const FOODS = [
  // ── GRAINS & CEREALS ──────────────────────────────────────────────────────
  { name: 'Rice (Raw)',        name_kannada: 'ಅಕ್ಕಿ',       category: 'GRAIN',   calories: 356, protein_g: 7.0, carbs_g: 79.0, fats_g: 0.5, fiber_g: 0.4, calcium_mg: 10,  iron_mg: 0.8, cooking_factor: 0.43 },
  { name: 'Wheat Flour (Atta)',name_kannada: 'ಗೋಧಿ ಹಿಟ್ಟು', category: 'GRAIN',   calories: 341, protein_g: 11.8, carbs_g: 71.2, fats_g: 1.5, fiber_g: 1.9, calcium_mg: 41, iron_mg: 3.0, cooking_factor: 1.0 },
  { name: 'Oats',              name_kannada: 'ಓಟ್ಸ್',       category: 'GRAIN',   calories: 389, protein_g: 16.9, carbs_g: 66.3, fats_g: 6.9, fiber_g: 10.6, calcium_mg: 54, iron_mg: 4.7, cooking_factor: 2.5 },
  { name: 'Chapati',           name_kannada: 'ಚಪಾತಿ',       category: 'GRAIN',   calories: 297, protein_g: 8.0, carbs_g: 52.0, fats_g: 7.0, fiber_g: 2.0, calcium_mg: 75,  iron_mg: 2.0, cooking_factor: 1.0 },
  { name: 'Idli',              name_kannada: 'ಇಡ್ಲಿ',       category: 'GRAIN',   calories: 154, protein_g: 3.9, carbs_g: 30.0, fats_g: 0.8, fiber_g: 0.4, calcium_mg: 15,  iron_mg: 0.7, cooking_factor: 1.0 },
  { name: 'Dosa Batter',       name_kannada: 'ದೋಸೆ ಹಿಟ್ಟು', category: 'GRAIN',   calories: 110, protein_g: 3.0, carbs_g: 22.0, fats_g: 1.0, fiber_g: 0.5, calcium_mg: 20,  iron_mg: 0.6, cooking_factor: 1.0 },
  { name: 'Poha',              name_kannada: 'ಅವಲಕ್ಕಿ',     category: 'GRAIN',   calories: 352, protein_g: 6.0, carbs_g: 77.0, fats_g: 0.6, fiber_g: 0.4, calcium_mg: 14,  iron_mg: 2.7, cooking_factor: 2.0 },
  { name: 'Upma Rava',         name_kannada: 'ಉಪ್ಮಾ ರವೆ',   category: 'GRAIN',   calories: 350, protein_g: 9.7, carbs_g: 73.0, fats_g: 1.5, fiber_g: 2.0, calcium_mg: 20,  iron_mg: 2.1, cooking_factor: 2.5 },
  { name: 'Ragi Flour',        name_kannada: 'ರಾಗಿ ಹಿಟ್ಟು', category: 'GRAIN',   calories: 336, protein_g: 7.3, carbs_g: 72.0, fats_g: 1.5, fiber_g: 3.6, calcium_mg: 344, iron_mg: 3.9, cooking_factor: 1.0 },
  { name: 'Quinoa',                                           category: 'GRAIN',   calories: 368, protein_g: 14.1, carbs_g: 64.2, fats_g: 6.1, fiber_g: 7.0, calcium_mg: 47, iron_mg: 4.6, cooking_factor: 2.5 },
  { name: 'Brown Rice (Raw)',                                 category: 'GRAIN',   calories: 362, protein_g: 7.5, carbs_g: 75.5, fats_g: 2.9, fiber_g: 3.5, calcium_mg: 23,  iron_mg: 1.5, cooking_factor: 0.43 },
  { name: 'Bajra Flour',       name_kannada: 'ಸಜ್ಜೆ ಹಿಟ್ಟು', category: 'GRAIN',  calories: 361, protein_g: 11.6, carbs_g: 67.5, fats_g: 5.0, fiber_g: 1.2, calcium_mg: 42, iron_mg: 16.9, cooking_factor: 1.0 },
  { name: 'Bread (White)',                                    category: 'GRAIN',   calories: 265, protein_g: 9.0, carbs_g: 49.0, fats_g: 3.2, fiber_g: 2.7, calcium_mg: 260, iron_mg: 2.5, cooking_factor: 1.0 },
  { name: 'Cornflakes',                                       category: 'GRAIN',   calories: 357, protein_g: 7.5, carbs_g: 84.0, fats_g: 0.4, fiber_g: 0.9, calcium_mg: 0,   iron_mg: 14.0, cooking_factor: 1.0 },

  // ── LENTILS & LEGUMES ──────────────────────────────────────────────────────
  { name: 'Dal (Toor/Arhar)',  name_kannada: 'ತೊಗರಿ ಬೇಳೆ',  category: 'LEGUME',  calories: 335, protein_g: 22.3, carbs_g: 57.6, fats_g: 1.7, fiber_g: 15.0, calcium_mg: 73, iron_mg: 5.8, cooking_factor: 2.5 },
  { name: 'Moong Dal',         name_kannada: 'ಹೆಸರು ಬೇಳೆ',  category: 'LEGUME',  calories: 347, protein_g: 24.0, carbs_g: 59.9, fats_g: 1.2, fiber_g: 16.3, calcium_mg: 75, iron_mg: 6.7, cooking_factor: 2.5 },
  { name: 'Chana Dal',         name_kannada: 'ಕಡಲೆ ಬೇಳೆ',   category: 'LEGUME',  calories: 360, protein_g: 20.5, carbs_g: 59.8, fats_g: 5.0, fiber_g: 8.0, calcium_mg: 100, iron_mg: 5.3, cooking_factor: 2.5 },
  { name: 'Masoor Dal (Red Lentil)', name_kannada: 'ಮಸೂರ್ ಬೇಳೆ', category: 'LEGUME', calories: 352, protein_g: 25.8, carbs_g: 59.0, fats_g: 1.1, fiber_g: 11.0, calcium_mg: 51, iron_mg: 7.6, cooking_factor: 2.5 },
  { name: 'Rajma (Kidney Beans)', name_kannada: 'ರಾಜ್ಮಾ',   category: 'LEGUME',  calories: 333, protein_g: 22.9, carbs_g: 60.0, fats_g: 1.5, fiber_g: 24.9, calcium_mg: 143, iron_mg: 8.2, cooking_factor: 2.5 },
  { name: 'Chickpeas (Kabuli Chana)', name_kannada: 'ಕಡಲೆ', category: 'LEGUME',  calories: 364, protein_g: 19.3, carbs_g: 60.7, fats_g: 6.0, fiber_g: 17.4, calcium_mg: 105, iron_mg: 6.2, cooking_factor: 2.5 },
  { name: 'Black Urad Dal',    name_kannada: 'ಉದ್ದು ಬೇಳೆ',  category: 'LEGUME',  calories: 347, protein_g: 25.2, carbs_g: 59.0, fats_g: 1.4, fiber_g: 15.0, calcium_mg: 138, iron_mg: 7.3, cooking_factor: 2.5 },
  { name: 'Soybean',                                          category: 'LEGUME',  calories: 446, protein_g: 36.5, carbs_g: 30.2, fats_g: 19.9, fiber_g: 9.3, calcium_mg: 277, iron_mg: 15.7, cooking_factor: 2.0 },
  { name: 'Peas (Fresh)',      name_kannada: 'ಬಟಾಣಿ',        category: 'LEGUME',  calories: 81,  protein_g: 5.4, carbs_g: 14.5, fats_g: 0.4, fiber_g: 5.1, calcium_mg: 25,  iron_mg: 1.5, cooking_factor: 1.0 },

  // ── PROTEINS ──────────────────────────────────────────────────────────────
  { name: 'Chicken Breast (Raw)',                             category: 'PROTEIN', calories: 165, protein_g: 31.0, carbs_g: 0.0, fats_g: 3.6, fiber_g: 0.0, calcium_mg: 15,  iron_mg: 1.0, cooking_factor: 0.75 },
  { name: 'Chicken Thigh (Raw)',                              category: 'PROTEIN', calories: 177, protein_g: 25.1, carbs_g: 0.0, fats_g: 7.9, fiber_g: 0.0, calcium_mg: 12,  iron_mg: 1.3, cooking_factor: 0.75 },
  { name: 'Egg (Whole)',       name_kannada: 'ಮೊಟ್ಟೆ',       category: 'PROTEIN', calories: 143, protein_g: 12.6, carbs_g: 0.7, fats_g: 9.5, fiber_g: 0.0, calcium_mg: 56,  iron_mg: 1.8, cooking_factor: 1.0, default_unit: 'PIECES' },
  { name: 'Egg White',                                        category: 'PROTEIN', calories: 52,  protein_g: 10.9, carbs_g: 0.7, fats_g: 0.2, fiber_g: 0.0, calcium_mg: 7,   iron_mg: 0.1, cooking_factor: 1.0 },
  { name: 'Fish (Rohu)',       name_kannada: 'ರೋಹು ಮೀನು',   category: 'PROTEIN', calories: 97,  protein_g: 16.6, carbs_g: 0.0, fats_g: 2.7, fiber_g: 0.0, calcium_mg: 650, iron_mg: 1.0, cooking_factor: 0.75 },
  { name: 'Fish (Pomfret)',    name_kannada: 'ಪಾಂಫ್ರೆಟ್',   category: 'PROTEIN', calories: 96,  protein_g: 17.4, carbs_g: 0.0, fats_g: 2.4, fiber_g: 0.0, calcium_mg: 200, iron_mg: 1.1, cooking_factor: 0.75 },
  { name: 'Mutton (Goat)',     name_kannada: 'ಆಡು ಮಾಂಸ',    category: 'PROTEIN', calories: 218, protein_g: 17.1, carbs_g: 0.0, fats_g: 16.7, fiber_g: 0.0, calcium_mg: 12,  iron_mg: 2.7, cooking_factor: 0.65 },
  { name: 'Paneer',            name_kannada: 'ಪನೀರ್',        category: 'PROTEIN', calories: 265, protein_g: 18.3, carbs_g: 1.2, fats_g: 20.8, fiber_g: 0.0, calcium_mg: 480, iron_mg: 0.5, cooking_factor: 1.0 },
  { name: 'Tofu',              name_kannada: 'ಟೋಫು',          category: 'PROTEIN', calories: 144, protein_g: 17.3, carbs_g: 2.8, fats_g: 8.7, fiber_g: 2.3, calcium_mg: 350, iron_mg: 2.7, cooking_factor: 1.0 },
  { name: 'Tuna (Canned)',                                    category: 'PROTEIN', calories: 116, protein_g: 25.5, carbs_g: 0.0, fats_g: 0.8, fiber_g: 0.0, calcium_mg: 10,  iron_mg: 1.3, cooking_factor: 1.0 },
  { name: 'Whey Protein (scoop)',                             category: 'PROTEIN', calories: 380, protein_g: 80.0, carbs_g: 8.0, fats_g: 4.0, fiber_g: 0.0, calcium_mg: 600, iron_mg: 1.0, cooking_factor: 1.0 },

  // ── DAIRY ─────────────────────────────────────────────────────────────────
  { name: 'Milk (Full Fat)',   name_kannada: 'ಹಾಲು',          category: 'DAIRY',   calories: 61,  protein_g: 3.2, carbs_g: 4.8, fats_g: 3.3, fiber_g: 0.0, calcium_mg: 120, iron_mg: 0.1, cooking_factor: 1.0, default_unit: 'ML' },
  { name: 'Milk (Toned)',      name_kannada: 'ಟೋಂಡ್ ಹಾಲು',   category: 'DAIRY',   calories: 42,  protein_g: 3.3, carbs_g: 4.7, fats_g: 1.5, fiber_g: 0.0, calcium_mg: 120, iron_mg: 0.1, cooking_factor: 1.0, default_unit: 'ML' },
  { name: 'Curd / Yogurt',     name_kannada: 'ಮೊಸರು',         category: 'DAIRY',   calories: 61,  protein_g: 3.5, carbs_g: 4.7, fats_g: 3.3, fiber_g: 0.0, calcium_mg: 120, iron_mg: 0.1, cooking_factor: 1.0 },
  { name: 'Greek Yogurt',                                     category: 'DAIRY',   calories: 100, protein_g: 10.0, carbs_g: 3.6, fats_g: 5.0, fiber_g: 0.0, calcium_mg: 111, iron_mg: 0.1, cooking_factor: 1.0 },
  { name: 'Cheese (Cheddar)',                                 category: 'DAIRY',   calories: 402, protein_g: 25.0, carbs_g: 1.3, fats_g: 33.1, fiber_g: 0.0, calcium_mg: 721, iron_mg: 0.7, cooking_factor: 1.0 },
  { name: 'Butter',            name_kannada: 'ಬೆಣ್ಣೆ',        category: 'DAIRY',   calories: 717, protein_g: 0.9, carbs_g: 0.1, fats_g: 81.1, fiber_g: 0.0, calcium_mg: 24,  iron_mg: 0.0, cooking_factor: 1.0, default_unit: 'TBSP' },

  // ── VEGETABLES ────────────────────────────────────────────────────────────
  { name: 'Spinach',           name_kannada: 'ಪಾಲಕ್',         category: 'VEGETABLE', calories: 23, protein_g: 2.9, carbs_g: 3.6, fats_g: 0.4, fiber_g: 2.2, calcium_mg: 99, iron_mg: 2.7, vitamin_c_mg: 28, cooking_factor: 0.3 },
  { name: 'Broccoli',                                          category: 'VEGETABLE', calories: 34, protein_g: 2.8, carbs_g: 6.6, fats_g: 0.4, fiber_g: 2.6, calcium_mg: 47, iron_mg: 0.7, vitamin_c_mg: 89, cooking_factor: 0.9 },
  { name: 'Carrot',            name_kannada: 'ಗಾಜರ್',          category: 'VEGETABLE', calories: 41, protein_g: 0.9, carbs_g: 9.6, fats_g: 0.2, fiber_g: 2.8, calcium_mg: 33, iron_mg: 0.3, vitamin_c_mg: 6, cooking_factor: 1.0 },
  { name: 'Tomato',            name_kannada: 'ಟಮಾಟೋ',          category: 'VEGETABLE', calories: 18, protein_g: 0.9, carbs_g: 3.9, fats_g: 0.2, fiber_g: 1.2, calcium_mg: 10, iron_mg: 0.3, vitamin_c_mg: 14, cooking_factor: 1.0 },
  { name: 'Onion',             name_kannada: 'ಈರುಳ್ಳಿ',        category: 'VEGETABLE', calories: 40, protein_g: 1.1, carbs_g: 9.3, fats_g: 0.1, fiber_g: 1.7, calcium_mg: 23, iron_mg: 0.2, vitamin_c_mg: 7, cooking_factor: 1.0 },
  { name: 'Potato',            name_kannada: 'ಆಲೂ',            category: 'VEGETABLE', calories: 77, protein_g: 2.0, carbs_g: 17.5, fats_g: 0.1, fiber_g: 2.2, calcium_mg: 12, iron_mg: 0.8, vitamin_c_mg: 20, cooking_factor: 1.0 },
  { name: 'Sweet Potato',                                      category: 'VEGETABLE', calories: 86, protein_g: 1.6, carbs_g: 20.1, fats_g: 0.1, fiber_g: 3.0, calcium_mg: 30, iron_mg: 0.6, vitamin_c_mg: 2, cooking_factor: 1.0 },
  { name: 'Bitter Gourd (Karela)', name_kannada: 'ಹಾಗಲಕಾಯಿ', category: 'VEGETABLE', calories: 17, protein_g: 1.0, carbs_g: 3.7, fats_g: 0.2, fiber_g: 2.8, calcium_mg: 19, iron_mg: 0.4, vitamin_c_mg: 84, cooking_factor: 0.9 },
  { name: 'Bottle Gourd (Lauki)', name_kannada: 'ಸೋರೆಕಾಯಿ', category: 'VEGETABLE', calories: 14, protein_g: 0.6, carbs_g: 3.4, fats_g: 0.0, fiber_g: 0.5, calcium_mg: 26, iron_mg: 0.2, vitamin_c_mg: 10, cooking_factor: 0.9 },
  { name: 'Drumstick (Moringa)', name_kannada: 'ನುಗ್ಗೆಕಾಯಿ', category: 'VEGETABLE', calories: 37, protein_g: 2.1, carbs_g: 8.5, fats_g: 0.2, fiber_g: 3.2, calcium_mg: 30, iron_mg: 0.4, vitamin_c_mg: 141, cooking_factor: 0.9 },
  { name: 'Cauliflower',       name_kannada: 'ಹೂ ಕೋಸು',       category: 'VEGETABLE', calories: 25, protein_g: 1.9, carbs_g: 4.9, fats_g: 0.3, fiber_g: 2.0, calcium_mg: 22, iron_mg: 0.4, vitamin_c_mg: 48, cooking_factor: 0.9 },
  { name: 'Capsicum (Bell Pepper)', name_kannada: 'ದೊಡ್ಡ ಮೆಣಸಿನಕಾಯಿ', category: 'VEGETABLE', calories: 31, protein_g: 1.0, carbs_g: 6.0, fats_g: 0.3, fiber_g: 2.1, calcium_mg: 7, iron_mg: 0.4, vitamin_c_mg: 128, cooking_factor: 0.9 },
  { name: 'Beans (French)',                                    category: 'VEGETABLE', calories: 31, protein_g: 1.8, carbs_g: 7.1, fats_g: 0.1, fiber_g: 3.4, calcium_mg: 37, iron_mg: 1.0, vitamin_c_mg: 12, cooking_factor: 0.9 },
  { name: 'Cucumber',          name_kannada: 'ಸೌತೆಕಾಯಿ',      category: 'VEGETABLE', calories: 15, protein_g: 0.7, carbs_g: 3.6, fats_g: 0.1, fiber_g: 0.5, calcium_mg: 16, iron_mg: 0.3, vitamin_c_mg: 2, cooking_factor: 1.0 },
  { name: 'Coriander Leaves',  name_kannada: 'ಕೊತ್ತಂಬರಿ',     category: 'VEGETABLE', calories: 23, protein_g: 2.1, carbs_g: 3.7, fats_g: 0.5, fiber_g: 2.8, calcium_mg: 67, iron_mg: 1.8, vitamin_c_mg: 27, cooking_factor: 1.0 },
  { name: 'Mushroom',                                          category: 'VEGETABLE', calories: 22, protein_g: 3.1, carbs_g: 3.3, fats_g: 0.3, fiber_g: 1.0, calcium_mg: 3,  iron_mg: 0.5, cooking_factor: 0.6 },

  // ── FRUITS ────────────────────────────────────────────────────────────────
  { name: 'Banana',            name_kannada: 'ಬಾಳೆಹಣ್ಣು',     category: 'FRUIT',   calories: 89, protein_g: 1.1, carbs_g: 22.8, fats_g: 0.3, fiber_g: 2.6, calcium_mg: 5,  iron_mg: 0.3, vitamin_c_mg: 8, cooking_factor: 1.0 },
  { name: 'Apple',             name_kannada: 'ಆಪಲ್',           category: 'FRUIT',   calories: 52, protein_g: 0.3, carbs_g: 13.8, fats_g: 0.2, fiber_g: 2.4, calcium_mg: 6,  iron_mg: 0.1, vitamin_c_mg: 5, cooking_factor: 1.0 },
  { name: 'Mango',             name_kannada: 'ಮಾವಿನಹಣ್ಣು',   category: 'FRUIT',   calories: 60, protein_g: 0.8, carbs_g: 15.0, fats_g: 0.4, fiber_g: 1.6, calcium_mg: 10, iron_mg: 0.2, vitamin_c_mg: 36, cooking_factor: 1.0 },
  { name: 'Orange',            name_kannada: 'ಕಿತ್ತಳೆ',        category: 'FRUIT',   calories: 47, protein_g: 0.9, carbs_g: 11.8, fats_g: 0.1, fiber_g: 2.4, calcium_mg: 40, iron_mg: 0.1, vitamin_c_mg: 53, cooking_factor: 1.0 },
  { name: 'Papaya',            name_kannada: 'ಪಪ್ಪಾಯಿ',        category: 'FRUIT',   calories: 43, protein_g: 0.5, carbs_g: 10.8, fats_g: 0.3, fiber_g: 1.7, calcium_mg: 20, iron_mg: 0.3, vitamin_c_mg: 62, cooking_factor: 1.0 },
  { name: 'Pomegranate',       name_kannada: 'ದಾಳಿಂಬೆ',        category: 'FRUIT',   calories: 83, protein_g: 1.7, carbs_g: 18.7, fats_g: 1.2, fiber_g: 4.0, calcium_mg: 10, iron_mg: 0.3, vitamin_c_mg: 10, cooking_factor: 1.0 },
  { name: 'Grapes',                                            category: 'FRUIT',   calories: 69, protein_g: 0.7, carbs_g: 18.1, fats_g: 0.2, fiber_g: 0.9, calcium_mg: 10, iron_mg: 0.4, vitamin_c_mg: 11, cooking_factor: 1.0 },
  { name: 'Watermelon',        name_kannada: 'ಕಲ್ಲಂಗಡಿ',       category: 'FRUIT',   calories: 30, protein_g: 0.6, carbs_g: 7.6, fats_g: 0.2, fiber_g: 0.4, calcium_mg: 7,  iron_mg: 0.2, vitamin_c_mg: 8, cooking_factor: 1.0 },
  { name: 'Guava',             name_kannada: 'ಪೇರಲೆ',          category: 'FRUIT',   calories: 68, protein_g: 2.6, carbs_g: 14.3, fats_g: 1.0, fiber_g: 5.4, calcium_mg: 18, iron_mg: 0.3, vitamin_c_mg: 228, cooking_factor: 1.0 },
  { name: 'Coconut (Fresh)',   name_kannada: 'ತಾಜಾ ತೆಂಗಿನಕಾಯಿ', category: 'FRUIT', calories: 354, protein_g: 3.3, carbs_g: 15.2, fats_g: 33.5, fiber_g: 9.0, calcium_mg: 14, iron_mg: 2.4, cooking_factor: 1.0 },

  // ── NUTS & SEEDS ──────────────────────────────────────────────────────────
  { name: 'Almonds',           name_kannada: 'ಬಾದಾಮಿ',         category: 'NUT',     calories: 579, protein_g: 21.2, carbs_g: 21.6, fats_g: 49.9, fiber_g: 12.5, calcium_mg: 264, iron_mg: 3.7, cooking_factor: 1.0 },
  { name: 'Cashews',           name_kannada: 'ಗೇರು ಬೀಜ',      category: 'NUT',     calories: 553, protein_g: 18.2, carbs_g: 30.2, fats_g: 43.8, fiber_g: 3.3, calcium_mg: 37,  iron_mg: 6.7, cooking_factor: 1.0 },
  { name: 'Walnuts',                                            category: 'NUT',     calories: 654, protein_g: 15.2, carbs_g: 13.7, fats_g: 65.2, fiber_g: 6.7, calcium_mg: 98,  iron_mg: 2.9, cooking_factor: 1.0 },
  { name: 'Groundnuts (Peanuts)', name_kannada: 'ಕಡಲೆ',        category: 'NUT',     calories: 567, protein_g: 25.8, carbs_g: 16.1, fats_g: 49.2, fiber_g: 8.5, calcium_mg: 92,  iron_mg: 4.6, cooking_factor: 1.0 },
  { name: 'Sesame Seeds',      name_kannada: 'ಎಳ್ಳು',           category: 'NUT',     calories: 573, protein_g: 17.7, carbs_g: 23.4, fats_g: 49.7, fiber_g: 11.8, calcium_mg: 975, iron_mg: 14.6, cooking_factor: 1.0 },
  { name: 'Flaxseeds',                                          category: 'NUT',     calories: 534, protein_g: 18.3, carbs_g: 28.9, fats_g: 42.2, fiber_g: 27.3, calcium_mg: 255, iron_mg: 5.7, cooking_factor: 1.0 },
  { name: 'Chia Seeds',                                         category: 'NUT',     calories: 486, protein_g: 16.5, carbs_g: 42.1, fats_g: 30.7, fiber_g: 34.4, calcium_mg: 631, iron_mg: 7.7, cooking_factor: 1.0 },

  // ── FATS & OILS ───────────────────────────────────────────────────────────
  { name: 'Ghee',              name_kannada: 'ತುಪ್ಪ',           category: 'FAT',     calories: 900, protein_g: 0.0, carbs_g: 0.0, fats_g: 100.0, fiber_g: 0.0, calcium_mg: 0, iron_mg: 0.0, cooking_factor: 1.0, default_unit: 'TBSP' },
  { name: 'Coconut Oil',                                        category: 'FAT',     calories: 862, protein_g: 0.0, carbs_g: 0.0, fats_g: 100.0, fiber_g: 0.0, calcium_mg: 0, iron_mg: 0.0, cooking_factor: 1.0, default_unit: 'TBSP' },
  { name: 'Olive Oil',                                          category: 'FAT',     calories: 884, protein_g: 0.0, carbs_g: 0.0, fats_g: 100.0, fiber_g: 0.0, calcium_mg: 1, iron_mg: 0.6, cooking_factor: 1.0, default_unit: 'TBSP' },
  { name: 'Sunflower Oil',                                      category: 'FAT',     calories: 884, protein_g: 0.0, carbs_g: 0.0, fats_g: 100.0, fiber_g: 0.0, calcium_mg: 0, iron_mg: 0.0, cooking_factor: 1.0, default_unit: 'TBSP' },

  // ── BEVERAGES ─────────────────────────────────────────────────────────────
  { name: 'Coconut Water',     name_kannada: 'ತೆಂಗಿನ ನೀರು',   category: 'BEVERAGE', calories: 19, protein_g: 0.7, carbs_g: 3.7, fats_g: 0.2, fiber_g: 1.1, calcium_mg: 24, iron_mg: 0.3, vitamin_c_mg: 2, cooking_factor: 1.0, default_unit: 'ML' },
  { name: 'Buttermilk',        name_kannada: 'ಮಜ್ಜಿಗೆ',         category: 'BEVERAGE', calories: 40, protein_g: 3.3, carbs_g: 4.8, fats_g: 0.9, fiber_g: 0.0, calcium_mg: 116, iron_mg: 0.1, cooking_factor: 1.0, default_unit: 'ML' },
  { name: 'Green Tea',                                           category: 'BEVERAGE', calories: 1,  protein_g: 0.2, carbs_g: 0.2, fats_g: 0.0, fiber_g: 0.0, calcium_mg: 0,  iron_mg: 0.0, cooking_factor: 1.0, default_unit: 'ML' },
  { name: 'Black Coffee',                                        category: 'BEVERAGE', calories: 2,  protein_g: 0.3, carbs_g: 0.0, fats_g: 0.0, fiber_g: 0.0, calcium_mg: 2,  iron_mg: 0.0, cooking_factor: 1.0, default_unit: 'ML' },
  { name: 'Protein Shake (Milk based)',                          category: 'BEVERAGE', calories: 150, protein_g: 25.0, carbs_g: 10.0, fats_g: 3.0, fiber_g: 1.0, calcium_mg: 300, iron_mg: 1.0, cooking_factor: 1.0, default_unit: 'ML' },

  // ── SPICES & CONDIMENTS ───────────────────────────────────────────────────
  { name: 'Sambar',            name_kannada: 'ಸಾಂಬಾರ್',         category: 'PREPARED', calories: 50, protein_g: 2.5, carbs_g: 8.0, fats_g: 1.0, fiber_g: 2.0, calcium_mg: 30, iron_mg: 0.8, cooking_factor: 1.0 },
  { name: 'Rasam',             name_kannada: 'ರಸಂ',              category: 'PREPARED', calories: 30, protein_g: 1.5, carbs_g: 5.0, fats_g: 0.5, fiber_g: 0.8, calcium_mg: 20, iron_mg: 0.5, cooking_factor: 1.0 },
  { name: 'Chutney (Coconut)', name_kannada: 'ಕಾಯಿ ಚಟ್ನಿ',      category: 'PREPARED', calories: 180, protein_g: 2.0, carbs_g: 8.0, fats_g: 16.0, fiber_g: 4.5, calcium_mg: 15, iron_mg: 1.2, cooking_factor: 1.0 },
  { name: 'Pickle (Mango)',    name_kannada: 'ಮಾವಿನ ಉಪ್ಪಿನಕಾಯಿ', category: 'CONDIMENT', calories: 88, protein_g: 0.8, carbs_g: 11.4, fats_g: 4.6, fiber_g: 2.4, calcium_mg: 25, iron_mg: 0.7, sodium_mg: 2300, cooking_factor: 1.0 },
  { name: 'Sugar',             name_kannada: 'ಸಕ್ಕರೆ',           category: 'CONDIMENT', calories: 387, protein_g: 0.0, carbs_g: 100.0, fats_g: 0.0, fiber_g: 0.0, calcium_mg: 1, iron_mg: 0.1, cooking_factor: 1.0, default_unit: 'TSP' },
  { name: 'Honey',             name_kannada: 'ಜೇನು ತುಪ್ಪ',       category: 'CONDIMENT', calories: 304, protein_g: 0.3, carbs_g: 82.4, fats_g: 0.0, fiber_g: 0.2, calcium_mg: 6, iron_mg: 0.4, cooking_factor: 1.0, default_unit: 'TBSP' },
  { name: 'Jaggery',          name_kannada: 'ಬೆಲ್ಲ',             category: 'CONDIMENT', calories: 383, protein_g: 0.4, carbs_g: 98.5, fats_g: 0.1, fiber_g: 0.0, calcium_mg: 80, iron_mg: 11.4, cooking_factor: 1.0 },
];

// ─── ACHIEVEMENTS ─────────────────────────────────────────────────────────────
const ACHIEVEMENTS = [
  { code: 'FIRST_WORKOUT',   name: 'First Step',        category: 'FITNESS',   points: 5,  description: 'Log your first workout', condition: { metric: 'workout_count', operator: 'gte', value: 1 } },
  { code: 'WEEK_WARRIOR',    name: 'Week Warrior',      category: 'FITNESS',   points: 20, description: 'Work out 7 days in a row', condition: { metric: 'consecutive_workout_days', operator: 'gte', value: 7 } },
  { code: 'IRON_MAN',        name: 'Iron Man',          category: 'FITNESS',   points: 100, description: 'Work out 30 consecutive days', condition: { metric: 'consecutive_workout_days', operator: 'gte', value: 30 } },
  { code: 'CARDIO_BEAST',    name: 'Cardio Beast',      category: 'FITNESS',   points: 50, description: 'Run 100km total', condition: { metric: 'total_run_distance_km', operator: 'gte', value: 100 } },
  { code: 'YOGA_ZEN',        name: 'Yoga Zen',          category: 'FITNESS',   points: 30, description: 'Complete 20 yoga sessions', condition: { metric: 'yoga_sessions', operator: 'gte', value: 20 } },
  { code: 'TREKKING_EXPLORER', name: 'Trekking Explorer', category: 'FITNESS', points: 40, description: 'Trek 50km total', condition: { metric: 'trekking_distance_km', operator: 'gte', value: 50 } },
  { code: 'FIRST_MEAL_LOG',  name: 'Nutrition Rookie', category: 'NUTRITION',  points: 5,  description: 'Log your first meal', condition: { metric: 'meals_logged', operator: 'gte', value: 1 } },
  { code: 'PROTEIN_MASTER',  name: 'Protein Master',   category: 'NUTRITION',  points: 30, description: 'Hit protein goal 7 consecutive days', condition: { metric: 'consecutive_protein_days', operator: 'gte', value: 7 } },
  { code: 'MACRO_MAESTRO',   name: 'Macro Maestro',    category: 'NUTRITION',  points: 50, description: 'Hit all macro goals 7 days in a row', condition: { metric: 'consecutive_macro_days', operator: 'gte', value: 7 } },
  { code: 'MEAL_LOGGER_50',  name: 'Dedicated Logger', category: 'NUTRITION',  points: 20, description: 'Log 50 meals', condition: { metric: 'meals_logged', operator: 'gte', value: 50 } },
  { code: 'MEAL_LOGGER_365', name: 'Raw Tracker',      category: 'NUTRITION',  points: 100, description: 'Log 365 meals', condition: { metric: 'meals_logged', operator: 'gte', value: 365 } },
  { code: 'FIRST_ORDER',     name: 'Cloud Kitchen Fan', category: 'KITCHEN',   points: 10, description: 'Place your first kitchen order', condition: { metric: 'kitchen_orders', operator: 'gte', value: 1 } },
  { code: 'STREAK_7',        name: '7-Day Streak',     category: 'STREAK',     points: 25, description: 'Maintain a 7-day activity streak', condition: { metric: 'activity_streak', operator: 'gte', value: 7 } },
  { code: 'FIRST_FRIEND',    name: 'Team Player',      category: 'SOCIAL',     points: 10, description: 'Add your first friend', condition: { metric: 'friends_count', operator: 'gte', value: 1 } },
];

// ─── SAMPLE CLOUD KITCHEN ─────────────────────────────────────────────────────
const SAMPLE_KITCHEN = {
  name: 'FitFuel Kitchen - Bangalore',
  city: 'Bangalore',
  address: '4th Block, Jayanagar, Bangalore - 560041',
  lat: 12.9249,
  lng: 77.5938,
  phone: '+91-80-4567-8901',
  email: 'bangalore@fitfuelkitchen.com',
  delivery_zones: ['560041', '560069', '560070', '560011', '560004', '560010'],
  max_capacity_per_day: 500,
  staff_count: 8,
};

// ─── MAIN SEED ────────────────────────────────────────────────────────────────
const SEGMENTS = [
  { name: 'Cubbon Park Loop', city: 'Bangalore', start_lat: 12.9716, start_lng: 77.5946, end_lat: 12.9716, end_lng: 77.5946, distance_km: 3.2, elevation_m: 0 },
  { name: 'Lalbagh Morning Sprint', city: 'Bangalore', start_lat: 12.9507, start_lng: 77.5848, end_lat: 12.9507, end_lng: 77.5848, distance_km: 2.8, elevation_m: 5 },
  { name: 'Ulsoor Lake Lap', city: 'Bangalore', start_lat: 12.9819, start_lng: 77.6198, end_lat: 12.9819, end_lng: 77.6198, distance_km: 2.4, elevation_m: 0 },
  { name: 'Nandi Hills Trek (Base to Summit)', city: 'Nandi Hills', start_lat: 13.3617, start_lng: 77.6836, end_lat: 13.3700, end_lng: 77.6872, distance_km: 3.5, elevation_m: 450 },
  { name: 'Skandagiri Night Trek', city: 'Chikballapur', start_lat: 13.4396, start_lng: 77.6770, end_lat: 13.4450, end_lng: 77.6810, distance_km: 4.0, elevation_m: 500 },
];

// ─── KITCHEN MEALS MENU ──────────────────────────────────────────────────────
const KITCHEN_MEALS = [
  // BREAKFAST
  { name: 'Masala Oats Bowl',          category: 'BREAKFAST', price_inr: 89,  calories: 320, protein_g: 12, carbs_g: 52, fats_g: 7,  fiber_g: 6.0, serving_weight: 300, is_vegetarian: true, is_vegan: true },
  { name: 'Ragi Idli with Sambar',     category: 'BREAKFAST', price_inr: 75,  calories: 280, protein_g: 10, carbs_g: 48, fats_g: 5,  fiber_g: 4.0, serving_weight: 280, is_vegetarian: true, is_vegan: true },
  { name: 'Egg White Omelette & Toast',category: 'BREAKFAST', price_inr: 110, calories: 310, protein_g: 28, carbs_g: 24, fats_g: 9,  fiber_g: 2.0, serving_weight: 250, is_vegetarian: false },
  { name: 'Moong Dal Chilla',          category: 'BREAKFAST', price_inr: 85,  calories: 260, protein_g: 14, carbs_g: 38, fats_g: 6,  fiber_g: 5.0, serving_weight: 220, is_vegetarian: true, is_vegan: true },
  { name: 'Greek Yogurt Parfait',      category: 'BREAKFAST', price_inr: 130, calories: 290, protein_g: 18, carbs_g: 35, fats_g: 7,  fiber_g: 3.0, serving_weight: 250, is_vegetarian: true },
  { name: 'Poha with Peanuts',         category: 'BREAKFAST', price_inr: 70,  calories: 350, protein_g: 9,  carbs_g: 58, fats_g: 10, fiber_g: 3.5, serving_weight: 300, is_vegetarian: true, is_vegan: true },

  // LUNCH
  { name: 'Grilled Chicken Rice Bowl', category: 'LUNCH', price_inr: 189, calories: 480, protein_g: 42, carbs_g: 48, fats_g: 10, fiber_g: 3.0, serving_weight: 400, is_vegetarian: false },
  { name: 'Paneer Tikka with Roti',    category: 'LUNCH', price_inr: 175, calories: 440, protein_g: 28, carbs_g: 46, fats_g: 16, fiber_g: 3.5, serving_weight: 380, is_vegetarian: true },
  { name: 'Dal Makhani & Brown Rice',  category: 'LUNCH', price_inr: 160, calories: 420, protein_g: 18, carbs_g: 64, fats_g: 11, fiber_g: 8.0, serving_weight: 400, is_vegetarian: true },
  { name: 'Rajma Rice (High Protein)', category: 'LUNCH', price_inr: 150, calories: 450, protein_g: 20, carbs_g: 72, fats_g: 8,  fiber_g: 12.0, serving_weight: 420, is_vegetarian: true, is_vegan: true },
  { name: 'Egg Curry with Roti',       category: 'LUNCH', price_inr: 165, calories: 430, protein_g: 26, carbs_g: 44, fats_g: 16, fiber_g: 3.0, serving_weight: 380, is_vegetarian: false },
  { name: 'Soya Chunks Pulao',         category: 'LUNCH', price_inr: 145, calories: 410, protein_g: 24, carbs_g: 58, fats_g: 9,  fiber_g: 5.0, serving_weight: 380, is_vegetarian: true, is_vegan: true },
  { name: 'Fish Curry & Rice',         category: 'LUNCH', price_inr: 210, calories: 460, protein_g: 38, carbs_g: 50, fats_g: 11, fiber_g: 2.5, serving_weight: 400, is_vegetarian: false },
  { name: 'Sambar Rice Bowl',          category: 'LUNCH', price_inr: 130, calories: 380, protein_g: 14, carbs_g: 62, fats_g: 8,  fiber_g: 6.0, serving_weight: 380, is_vegetarian: true, is_vegan: true },

  // DINNER
  { name: 'Quinoa Vegetable Bowl',     category: 'DINNER', price_inr: 199, calories: 380, protein_g: 16, carbs_g: 52, fats_g: 12, fiber_g: 7.0, serving_weight: 380, is_vegetarian: true, is_vegan: true },
  { name: 'Chicken Soup & Multigrain Bread', category: 'DINNER', price_inr: 185, calories: 320, protein_g: 30, carbs_g: 28, fats_g: 8, fiber_g: 3.0, serving_weight: 350, is_vegetarian: false },
  { name: 'Palak Paneer & Roti',       category: 'DINNER', price_inr: 170, calories: 400, protein_g: 22, carbs_g: 42, fats_g: 17, fiber_g: 5.0, serving_weight: 360, is_vegetarian: true },
  { name: 'Grilled Fish with Salad',   category: 'DINNER', price_inr: 220, calories: 350, protein_g: 36, carbs_g: 16, fats_g: 14, fiber_g: 4.0, serving_weight: 330, is_vegetarian: false },
  { name: 'Moong Dal Soup & Roti',     category: 'DINNER', price_inr: 140, calories: 340, protein_g: 18, carbs_g: 48, fats_g: 8,  fiber_g: 7.0, serving_weight: 350, is_vegetarian: true, is_vegan: true },
  { name: 'Tofu Stir Fry & Brown Rice',category: 'DINNER', price_inr: 180, calories: 390, protein_g: 20, carbs_g: 54, fats_g: 12, fiber_g: 5.0, serving_weight: 380, is_vegetarian: true, is_vegan: true },

  // SNACK
  { name: 'Sprouts Chaat',             category: 'SNACK', price_inr: 65,  calories: 180, protein_g: 11, carbs_g: 28, fats_g: 3,  fiber_g: 6.0, serving_weight: 200, is_vegetarian: true, is_vegan: true },
  { name: 'Boiled Egg (2) & Nuts',     category: 'SNACK', price_inr: 80,  calories: 220, protein_g: 16, carbs_g: 5,  fats_g: 15, fiber_g: 1.5, serving_weight: 150, is_vegetarian: false },
  { name: 'Fruit & Nut Mix',           category: 'SNACK', price_inr: 90,  calories: 200, protein_g: 5,  carbs_g: 28, fats_g: 9,  fiber_g: 3.0, serving_weight: 120, is_vegetarian: true, is_vegan: true },
  { name: 'Roasted Chana Bowl',        category: 'SNACK', price_inr: 55,  calories: 190, protein_g: 10, carbs_g: 30, fats_g: 4,  fiber_g: 8.0, serving_weight: 100, is_vegetarian: true, is_vegan: true },
  { name: 'Whey Protein Smoothie',     category: 'SNACK', price_inr: 120, calories: 250, protein_g: 26, carbs_g: 24, fats_g: 4,  fiber_g: 1.0, serving_weight: 350, is_vegetarian: true },
];

async function main() {
  console.log('🌱 Starting database seed...');

  // Seed foods — createMany with skipDuplicates is faster than individual upserts
  console.log(`\n📦 Seeding ${FOODS.length} Indian foods...`);
  const foodResult = await prisma.food.createMany({ data: FOODS, skipDuplicates: true });
  console.log(`   ✅ ${foodResult.count} new foods inserted (duplicates skipped)`);

  // Seed achievements
  console.log(`\n🏆 Seeding ${ACHIEVEMENTS.length} achievements...`);
  const achResult = await prisma.achievement.createMany({ data: ACHIEVEMENTS, skipDuplicates: true });
  console.log(`   ✅ ${achResult.count} achievements inserted`);

  // Seed cloud kitchen
  console.log('\n🍳 Seeding sample cloud kitchen...');
  await prisma.cloudKitchen.createMany({ data: [SAMPLE_KITCHEN], skipDuplicates: true });
  console.log('   ✅ Cloud kitchen seeded');

  // Seed GPS segments
  console.log('\n🏃 Seeding running segments...');
  const segResult = await prisma.segment.createMany({ data: SEGMENTS, skipDuplicates: true });
  console.log(`   ✅ ${segResult.count} segments inserted`);

  // Seed kitchen meals
  console.log('\n🍽️  Seeding kitchen meals menu...');
  const mealsResult = await prisma.kitchenMeal.createMany({ data: KITCHEN_MEALS, skipDuplicates: true });
  console.log(`   ✅ ${mealsResult.count} kitchen meals inserted`);

  // ── Phase 3A: Live Classes ───────────────────────────────────────────────────
  console.log('\n🎥 Seeding live workout classes...');
  const CLASSES = [
    // Recurring daily live classes
    { title: 'Morning Yoga Flow', description: 'Start your day with sun salutations and pranayama. Suitable for all levels.', instructor: 'Priya Sharma', class_type: 'YOGA', level: 'ALL_LEVELS', duration_min: 45, calories_burn: 180, is_live: true, is_free: true, max_participants: 100, tags: ['morning','flexibility','breathing'], met_value: 3.0 },
    { title: 'Evening HIIT Blast', description: 'High-intensity interval training. 30 min, maximum burn.', instructor: 'Rohit Nair', class_type: 'HIIT', level: 'INTERMEDIATE', duration_min: 30, calories_burn: 320, is_live: true, is_free: true, max_participants: 80, tags: ['evening','fat-burn','cardio'], met_value: 8.0 },
    { title: 'Weekend Zumba Party', description: 'Dance your calories away. Latin-Bollywood fusion. All welcome!', instructor: 'Neha Kapoor', class_type: 'ZUMBA', level: 'ALL_LEVELS', duration_min: 60, calories_burn: 400, is_live: true, is_free: false, price_inr: 49, max_participants: 150, tags: ['weekend','dance','fun'], met_value: 6.5 },
    // Recorded / on-demand
    { title: 'Beginner Pilates Core', description: '28-day pilates programme. Strengthen your core, improve posture.', instructor: 'Aisha Menon', class_type: 'PILATES', level: 'BEGINNER', duration_min: 35, calories_burn: 160, is_live: false, is_free: true, tags: ['core','posture','beginner'], met_value: 3.5 },
    { title: 'Power Strength 45', description: 'Compound movements — squats, deadlifts, rows. Full body strength.', instructor: 'Vikram Singh', class_type: 'STRENGTH', level: 'INTERMEDIATE', duration_min: 45, calories_burn: 280, is_live: false, is_free: true, tags: ['strength','muscle','compound'], met_value: 5.0 },
    { title: 'Guided Meditation & Breathwork', description: 'Reduce cortisol, improve sleep. 20 min guided session.', instructor: 'Dr. Kavita Rao', class_type: 'MEDITATION', level: 'ALL_LEVELS', duration_min: 20, calories_burn: 40, is_live: false, is_free: true, tags: ['stress','sleep','mindfulness'], met_value: 1.5 },
    { title: 'Indian Classical Dance Cardio', description: 'Bharatanatyam-inspired cardio. Fun, cultural, effective.', instructor: 'Deepa Krishnan', class_type: 'DANCE', level: 'BEGINNER', duration_min: 45, calories_burn: 350, is_live: false, is_free: false, price_inr: 99, tags: ['dance','cultural','cardio'], met_value: 6.5 },
    { title: 'Morning Stretch & Mobility', description: 'Wake up your joints. 15 min daily mobility routine.', instructor: 'Priya Sharma', class_type: 'STRETCHING', level: 'ALL_LEVELS', duration_min: 15, calories_burn: 50, is_live: false, is_free: true, tags: ['morning','mobility','recovery'], met_value: 2.5 },
    { title: 'Tabata Cardio Finisher', description: '20-sec on, 10-sec off × 8 rounds. 4 exercises, 16 min total.', instructor: 'Rohit Nair', class_type: 'CARDIO', level: 'ADVANCED', duration_min: 16, calories_burn: 220, is_live: false, is_free: true, tags: ['tabata','quick','intense'], met_value: 7.0 },
    { title: 'Yoga for PCOS', description: 'Gentle yoga sequence targeting hormonal balance. Yin + restorative.', instructor: 'Dr. Kavita Rao', class_type: 'YOGA', level: 'BEGINNER', duration_min: 40, calories_burn: 130, is_live: false, is_free: true, tags: ['pcos','hormonal','gentle','women'], met_value: 2.5 },
    { title: 'Diabetes-Friendly Low-Impact Cardio', description: 'Brisk walking intervals + light aerobics. Safe for diabetics.', instructor: 'Aisha Menon', class_type: 'CARDIO', level: 'BEGINNER', duration_min: 30, calories_burn: 160, is_live: false, is_free: true, tags: ['diabetes','low-impact','safe'], met_value: 4.0 },
    { title: 'Weekend Warrior HIIT', description: 'Saturday special. 45 min full-body HIIT with warmup & cooldown.', instructor: 'Vikram Singh', class_type: 'HIIT', level: 'ADVANCED', duration_min: 45, calories_burn: 480, is_live: false, is_free: false, price_inr: 49, tags: ['weekend','advanced','challenge'], met_value: 9.0 },
  ];
  const classResult = await prisma.workoutClass.createMany({ data: CLASSES, skipDuplicates: true });
  console.log(`   ✅ ${classResult.count} workout classes inserted`);

  // ── Phase 3A: Specialist Programs ───────────────────────────────────────────
  console.log('\n🩺 Seeding specialist programs...');
  const PROGRAMS = [
    {
      name:           'Diabetes Reversal Program',
      program_type:   'DIABETES',
      description:    '12-week evidence-based program combining low-GI meal plans, resistance training, and blood sugar monitoring to manage Type 2 diabetes through lifestyle changes.',
      duration_weeks: 12,
      features:       ['Personalised low-GI meal plans','Blood sugar logging with trend analysis','Resistance + low-impact cardio routines','Weekly AI insights','Dedicated diabetes-friendly kitchen meals','Quarterly HbA1c tracker'],
      price_inr:      1999,
      weekly_plans: {
        week1:  { theme: 'Foundation', focus: 'Baseline logging, low-GI diet intro, daily walks' },
        week2:  { theme: 'Movement', focus: 'Add resistance 3×/week, pre/post meal readings' },
        week3:  { theme: 'Nutrition', focus: 'Eliminate refined carbs, introduce legume-heavy meals' },
        week4:  { theme: 'Review 1', focus: 'Check average fasting glucose, adjust meal plan' },
        week5:  { theme: 'Intensify', focus: 'Increase workout duration, protein targets' },
        week6:  { theme: 'Stress Management', focus: 'Meditation + yoga, cortisol & glucose link' },
        week7:  { theme: 'Meal Timing', focus: 'Intermittent eating window, overnight fasting practice' },
        week8:  { theme: 'Review 2', focus: 'Progress check, celebrate wins, recalibrate' },
        week9:  { theme: 'Advanced Nutrition', focus: 'Fibre-loading, resistant starch foods' },
        week10: { theme: 'Peak Fitness', focus: 'HIIT-lite circuits, maximum calorie deficit phase' },
        week11: { theme: 'Maintenance', focus: 'Sustainable habits, social eating strategies' },
        week12: { theme: 'Graduation', focus: 'Final review, lifelong plan, celebrate journey' },
      },
    },
    {
      name:           'PCOS Heal Program',
      program_type:   'PCOS',
      description:    '12-week holistic PCOS management through anti-inflammatory nutrition, cycle-synced workouts, stress reduction, and hormonal balance tracking.',
      duration_weeks: 12,
      features:       ['Cycle-synced workout plans','Anti-inflammatory Indian meal plans','Cycle tracking + period predictions','Yoga & Breathwork classes','Iron & folate tracking','Hormonal health insights'],
      price_inr:      1499,
      weekly_plans: {
        week1:  { theme: 'Understand Your Cycle', focus: 'Baseline cycle logging, anti-inflammatory diet intro' },
        week2:  { theme: 'Follicular Phase Fuel', focus: 'High-intensity in follicular phase, estrogen-balancing foods' },
        week3:  { theme: 'Gut Health', focus: 'Probiotic foods, fiber, reduce dairy experiment' },
        week4:  { theme: 'Review 1', focus: 'Cycle regularity check, energy levels assessment' },
        week5:  { theme: 'Stress & Cortisol', focus: 'Adaptogen foods, yoga, 10-min daily meditation' },
        week6:  { theme: 'Luteal Phase Support', focus: 'Gentle workouts, magnesium-rich foods, sleep hygiene' },
        week7:  { theme: 'Insulin Sensitivity', focus: 'Low-GI focus, strength training benefits for PCOS' },
        week8:  { theme: 'Review 2', focus: 'Symptom tracker review, adjust program' },
        week9:  { theme: 'Detox & Liver Health', focus: 'Cruciferous vegs, turmeric protocol' },
        week10: { theme: 'Strength Phase', focus: 'Build lean muscle to improve insulin sensitivity' },
        week11: { theme: 'Cycle Harmony', focus: 'Full cycle awareness, track improvements' },
        week12: { theme: 'Graduation', focus: 'Compare cycle data, celebrate, maintenance plan' },
      },
    },
    {
      name:           'Heart Health 8-Week Reset',
      program_type:   'HEART_HEALTH',
      description:    '8-week cardiac wellness program — DASH diet, progressive cardio, stress management, and cholesterol-conscious nutrition for Indian heart health.',
      duration_weeks: 8,
      features:       ['DASH diet meal plans','Progressive cardio protocol','Heart rate zone training','Sodium & saturated fat tracking','Stress & sleep optimization','Weekly cardio benchmarks'],
      price_inr:      999,
      weekly_plans: {
        week1: { theme: 'Baseline', focus: 'Resting HR, BP log, DASH diet introduction' },
        week2: { theme: 'Zone 2 Cardio', focus: '30 min daily zone 2 walking, reduce sodium' },
        week3: { theme: 'Plant Power', focus: 'Vegetable-heavy meals, omega-3 sources' },
        week4: { theme: 'Review 1', focus: 'Resting HR trend, fitness benchmark' },
        week5: { theme: 'Intensity Up', focus: 'Add interval sessions, HIIT-lite' },
        week6: { theme: 'Stress Protocol', focus: 'Meditation, sleep tracking, cortisol diet' },
        week7: { theme: 'Peak Cardio', focus: 'Longest continuous cardio session of program' },
        week8: { theme: 'Graduation', focus: 'Final HR benchmark, sustainable plan' },
      },
    },
    {
      name:           'Thyroid Wellness Program',
      program_type:   'THYROID',
      description:    '10-week thyroid support through selenium/iodine-balanced nutrition, low-inflammation diet, appropriate exercise pacing, and energy management.',
      duration_weeks: 10,
      features:       ['Thyroid-friendly meal plans','Selenium & iodine nutrient tracking','Energy-paced workouts','Anti-inflammatory foods','Fatigue management strategies','Gluten-free options'],
      price_inr:      1299,
      weekly_plans: {
        week1:  { theme: 'Thyroid Nutrition 101', focus: 'Selenium foods, iodine sources, goitrogenic foods to limit' },
        week2:  { theme: 'Energy Baseline', focus: 'Track energy levels, low-impact workouts only' },
        week3:  { theme: 'Inflammation Control', focus: 'Turmeric, ginger protocol, anti-inflammatory Indian diet' },
        week4:  { theme: 'Review 1', focus: 'Energy trend, symptom journal review' },
        week5:  { theme: 'Gut-Thyroid Axis', focus: 'Probiotic foods, gut healing protocol' },
        week6:  { theme: 'Progressive Movement', focus: 'Gradually increase workout intensity as energy allows' },
        week7:  { theme: 'Stress & Cortisol', focus: 'Cortisol spikes affect T3/T4 — stress management focus' },
        week8:  { theme: 'Review 2', focus: 'Full symptom vs energy vs activity correlation' },
        week9:  { theme: 'Optimise & Peak', focus: 'Refined nutrition, steady workout schedule' },
        week10: { theme: 'Graduation', focus: 'Long-term thyroid wellness plan' },
      },
    },
    {
      name:           'Weight Loss Intensive — 16 Weeks',
      program_type:   'WEIGHT_LOSS_INTENSIVE',
      description:    'Structured 16-week fat loss program — progressive caloric deficit, strength training to preserve muscle, and Indian meal plans. Evidence-based, no fad diets.',
      duration_weeks: 16,
      features:       ['Progressive calorie deficit (250–500 kcal/day)','Strength training 4×/week','Weekly weigh-ins + measurement tracking','High-protein Indian meal plans','Plateau-busting protocols','Community challenges & leaderboard'],
      price_inr:      2499,
      weekly_plans: {
        week1:  { theme: 'Baseline', focus: 'TDEE calculation, macros set, baseline photos' },
        week2:  { theme: 'Deficit Start', focus: '−250 kcal deficit, 3× strength workouts' },
        week3:  { theme: 'Protein Priority', focus: 'Hit 1.6g/kg protein daily, add daily walks' },
        week4:  { theme: 'Review 1', focus: 'Weigh-in, measurements, adjust if needed' },
        week5:  { theme: 'Intensify', focus: '−350 kcal deficit, 4× strength workouts' },
        week6:  { theme: 'NEAT Boost', focus: 'Steps target 8,000/day, stair challenges' },
        week7:  { theme: 'Refeed', focus: 'Controlled refeed day, importance of metabolic flexibility' },
        week8:  { theme: 'Review 2', focus: 'Progress photos, measurements, motivation check' },
        week9:  { theme: 'Peak Deficit', focus: '−500 kcal, HIIT 2×/week added' },
        week10: { theme: 'Body Recomposition', focus: 'Strength up + fat loss simultaneously' },
        week11: { theme: 'Plateau Buster', focus: 'Macro cycling, carb-cycling protocol' },
        week12: { theme: 'Review 3', focus: 'Total loss so far, adjust final 4 weeks' },
        week13: { theme: 'Sprint', focus: 'Highest intensity phase' },
        week14: { theme: 'Tighten', focus: 'Tightest nutrition compliance week' },
        week15: { theme: 'Maintenance Preview', focus: 'Gradually reduce deficit, practise maintenance eating' },
        week16: { theme: 'Graduation', focus: 'Final measurements, maintain plan, celebrate!' },
      },
    },
  ];
  const progResult = await prisma.specialistProgram.createMany({ data: PROGRAMS, skipDuplicates: true });
  console.log(`   ✅ ${progResult.count} specialist programs inserted`);

  const foodTotal  = await prisma.food.count();
  const achTotal   = await prisma.achievement.count();
  const kitchTotal = await prisma.cloudKitchen.count();
  const segTotal   = await prisma.segment.count();

  console.log('\n🎉 Seed complete!');
  const mealsTotal = await prisma.kitchenMeal.count();
  console.log('   Foods:         ', foodTotal);
  console.log('   Kitchen Meals: ', mealsTotal);
  console.log('   Achievements:  ', achTotal);
  console.log('   Kitchens:      ', kitchTotal);
  console.log('   Segments:      ', segTotal);
  console.log('   Classes:       ', await prisma.workoutClass.count());
  console.log('   Programs:      ', await prisma.specialistProgram.count());
}

main()
  .catch((e) => { console.error('❌ Seed failed:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
