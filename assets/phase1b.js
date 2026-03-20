// assets/phase1b.js
// Phase 1B additions loaded after main app

// ─── WEEKLY CHART (Chart.js) ────────────────────────────────────────────────
const WeeklyChart = {
  chartInstance: null,

  async render(canvasId) {
    const res = await api('GET', '/nutrition/weekly?days=7');
    if (!res.success) return;

    const days  = res.data.days;
    const goals = res.data.goals;

    const labels   = days.map(d => new Date(d.date).toLocaleDateString('en-IN', { weekday: 'short' }));
    const calories = days.map(d => d.calories);
    const protein  = days.map(d => d.protein);
    const burned   = days.map(d => d.burned);

    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    if (WeeklyChart.chartInstance) WeeklyChart.chartInstance.destroy();

    WeeklyChart.chartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Calories In',
            data: calories,
            backgroundColor: 'rgba(232,245,78,0.7)',
            borderColor: '#e8f54e',
            borderWidth: 1,
            borderRadius: 6,
          },
          {
            label: 'Calories Burned',
            data: burned,
            backgroundColor: 'rgba(255,107,53,0.7)',
            borderColor: '#ff6b35',
            borderWidth: 1,
            borderRadius: 6,
            type: 'bar',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#888', font: { size: 11 } } },
          tooltip: {
            backgroundColor: '#252525',
            titleColor: '#f0f0f0',
            bodyColor: '#888',
            borderColor: '#2e2e2e',
            borderWidth: 1,
          },
        },
        scales: {
          x: { ticks: { color: '#888' }, grid: { color: '#1e1e1e' } },
          y: {
            ticks: { color: '#888' }, grid: { color: '#1e1e1e' },
            ...(goals ? { suggestedMax: goals.target_calories * 1.2 } : {}),
          },
        },
      },
    });
  },
};

// ─── MICRONUTRIENT DASHBOARD ─────────────────────────────────────────────────
const MicroNutrients = {
  async render(containerId, date) {
    const d   = date || new Date().toISOString().split('T')[0];
    const res = await api('GET', `/nutrition/daily?date=${d}`);
    if (!res.success) return;

    const { nutrient_status, recommendations } = res.data;
    const container = document.getElementById(containerId);
    if (!container) return;

    const macros = ['calories', 'protein_g', 'carbs_g', 'fats_g', 'fiber_g'];
    const minerals = ['calcium_mg', 'iron_mg', 'zinc_mg', 'magnesium_mg', 'potassium_mg', 'sodium_mg'];
    const vitamins = ['vitamin_c_mg', 'vitamin_d_mcg', 'vitamin_b12_mcg', 'folate_mcg'];

    const statusColor = { good: '#2ecc71', warning: '#f39c12', low: '#e74c3c', danger: '#e74c3c' };

    const renderGroup = (keys, title) => `
      <div style="margin-bottom:20px;">
        <div style="font-family:var(--font-head); font-size:11px; font-weight:700; color:var(--muted);
                    letter-spacing:1px; text-transform:uppercase; margin-bottom:12px;">${title}</div>
        ${keys.map(k => {
          const n = nutrient_status[k];
          if (!n) return '';
          const color = statusColor[n.status] || '#888';
          const barPct = Math.min(n.pct, 100);
          const overPct = n.pct > 100 ? Math.min(n.pct - 100, 50) : 0;
          return `
            <div style="margin-bottom:10px;">
              <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                <span style="font-size:13px; font-weight:500;">${n.label}</span>
                <span style="font-size:12px; color:${color}; font-family:var(--font-head); font-weight:700;">
                  ${n.actual.toFixed(n.actual < 10 ? 1 : 0)}${n.unit} / ${n.rda}${n.unit}
                </span>
              </div>
              <div style="height:5px; background:var(--bg3); border-radius:3px; overflow:hidden; position:relative;">
                <div style="width:${barPct}%; background:${color}; height:100%; border-radius:3px; transition:width .6s ease;"></div>
                ${overPct > 0 ? `<div style="position:absolute; right:0; top:0; width:${overPct}%; background:var(--danger); height:100%; border-radius:0 3px 3px 0; opacity:.6;"></div>` : ''}
              </div>
            </div>`;
        }).join('')}
      </div>`;

    container.innerHTML = `
      ${renderGroup(macros, 'Macronutrients')}
      ${renderGroup(minerals, 'Minerals')}
      ${renderGroup(vitamins, 'Vitamins')}

      ${recommendations.length ? `
        <div style="margin-top:8px;">
          <div style="font-family:var(--font-head); font-size:11px; font-weight:700; color:var(--muted);
                      letter-spacing:1px; text-transform:uppercase; margin-bottom:12px;">💡 Recommendations</div>
          ${recommendations.map(r => `
            <div style="background:rgba(232,245,78,.06); border:1px solid rgba(232,245,78,.15);
                        border-radius:10px; padding:14px; margin-bottom:10px;">
              <div style="font-weight:600; font-size:13px; color:var(--accent); margin-bottom:6px;">
                ${r.nutrient} only ${r.pct}% of goal
              </div>
              ${r.suggestions.map(s => `<div style="font-size:12px; color:var(--muted); margin-bottom:3px;">→ ${s}</div>`).join('')}
            </div>`).join('')}
        </div>` : ''}
    `;
  },
};

// ─── BARCODE SCANNER (BarcodeDetector API) ──────────────────────────────────
const Barcode = {
  stream: null,
  detector: null,
  animFrame: null,

  isSupported() {
    return 'BarcodeDetector' in window;
  },

  async start(onFound) {
    if (!Barcode.isSupported()) {
      Toast.show('Barcode scanning not supported on this device/browser', 'error');
      return;
    }

    try {
      Barcode.detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] });
      Barcode.stream   = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });

      // Build scanner overlay
      const overlay = document.createElement('div');
      overlay.id = 'barcode-overlay';
      overlay.style.cssText = `
        position:fixed; inset:0; background:#000; z-index:200;
        display:flex; flex-direction:column; align-items:center; justify-content:center;
      `;
      overlay.innerHTML = `
        <video id="barcode-video" autoplay playsinline
          style="width:100%; max-width:480px; border-radius:12px;"></video>
        <div style="position:absolute; width:260px; height:160px; border:2px solid var(--accent);
                    border-radius:12px; box-shadow:0 0 0 9999px rgba(0,0,0,.6);"></div>
        <div style="color:#888; font-size:13px; margin-top:20px;">Point camera at barcode</div>
        <button onclick="Barcode.stop()" style="margin-top:16px; padding:12px 24px; background:var(--surface);
          border:1px solid var(--border); border-radius:8px; color:var(--text); font-family:var(--font-head);
          font-size:13px; font-weight:700; cursor:pointer; letter-spacing:.3px;">CANCEL</button>
      `;
      document.body.appendChild(overlay);

      const video = document.getElementById('barcode-video');
      video.srcObject = Barcode.stream;
      await video.play();

      const scan = async () => {
        if (!Barcode.stream) return;
        try {
          const barcodes = await Barcode.detector.detect(video);
          if (barcodes.length > 0) {
            const code = barcodes[0].rawValue;
            Barcode.stop();
            onFound(code);
            return;
          }
        } catch {}
        Barcode.animFrame = requestAnimationFrame(scan);
      };
      Barcode.animFrame = requestAnimationFrame(scan);
    } catch (e) {
      Toast.show('Camera access denied', 'error');
      Barcode.stop();
    }
  },

  stop() {
    cancelAnimationFrame(Barcode.animFrame);
    if (Barcode.stream) {
      Barcode.stream.getTracks().forEach(t => t.stop());
      Barcode.stream = null;
    }
    document.getElementById('barcode-overlay')?.remove();
  },

  async lookup(code) {
    try {
      const res = await api('GET', `/meals/foods/barcode/${encodeURIComponent(code)}`);
      if (res.success && res.data?.food) {
        Meal.openFoodModal(res.data.food);
        Toast.show(`Found: ${res.data.food.name}`, 'success');
      } else {
        Toast.show(`Barcode ${code} not in database`, 'error');
      }
    } catch {
      Toast.show('Food not found for this barcode', 'error');
    }
  },
};

// ─── PUSH NOTIFICATION SETUP ─────────────────────────────────────────────────
const PushNotifications = {
  VAPID_PUBLIC_KEY: 'YOUR_VAPID_PUBLIC_KEY', // replace before deploy

  async setup() {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    try {
      const reg  = await navigator.serviceWorker.ready;
      const sub  = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: PushNotifications.urlBase64ToUint8Array(PushNotifications.VAPID_PUBLIC_KEY),
      });

      await api('POST', '/push/subscribe', {
        subscription: sub.toJSON(),
        device_name:  navigator.userAgent.substring(0, 50),
      });

      Toast.show('🔔 Notifications enabled', 'success');
    } catch (e) {
      console.warn('Push setup failed:', e.message);
    }
  },

  urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw     = atob(base64);
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
  },
};

// ─── STREAK TRACKER ──────────────────────────────────────────────────────────
const Streak = {
  async get() {
    const res = await api('GET', '/workouts?limit=60');
    const workouts = res.data?.workouts || [];

    const uniqueDays = new Set(workouts.map(w => w.date?.split('T')[0]));
    const today = new Date();
    let streak = 0;

    for (let i = 0; i < 60; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = d.toISOString().split('T')[0];
      if (uniqueDays.has(key)) streak++;
      else if (i > 0) break;
    }

    return streak;
  },

  render(streak) {
    if (!streak) return '';
    const fire = streak >= 30 ? '🔥🔥🔥' : streak >= 14 ? '🔥🔥' : '🔥';
    return `<div style="display:flex; align-items:center; gap:8px; padding:12px 16px;
                background:rgba(255,107,53,.1); border:1px solid rgba(255,107,53,.2);
                border-radius:10px; margin-bottom:16px;">
      <span style="font-size:24px">${fire}</span>
      <div>
        <div style="font-family:var(--font-head); font-size:18px; font-weight:800; color:#ff6b35;">${streak} Day Streak</div>
        <div style="font-size:12px; color:var(--muted);">Keep going — don't break the chain!</div>
      </div>
    </div>`;
  },
};

// ─── WATER TRACKER ───────────────────────────────────────────────────────────
const Water = {
  goal: 2500,
  today: 0,

  async load() {
    const today = new Date().toISOString().split('T')[0];
    const res   = await api('GET', `/daily-summary?date=${today}`);
    Water.today = res.data?.actuals?.water_ml || 0;
    Water.render();
  },

  async add(ml) {
    const res = await api('POST', '/water', { ml });
    if (res.success) {
      Water.today += ml;
      Water.render();
      Toast.show(`💧 +${ml}ml logged`, 'success');
    }
  },

  render() {
    const el = document.getElementById('water-tracker');
    if (!el) return;
    const pct = Math.min(Math.round((Water.today / Water.goal) * 100), 100);
    el.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <div style="font-family:var(--font-head); font-size:14px; font-weight:700;">💧 Water</div>
        <div style="font-size:13px; color:var(--accent3);">${Water.today}ml / ${Water.goal}ml</div>
      </div>
      <div style="height:8px; background:var(--bg3); border-radius:4px; overflow:hidden; margin-bottom:12px;">
        <div style="width:${pct}%; height:100%; background:var(--accent3); border-radius:4px; transition:width .5s ease;"></div>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        ${[150, 250, 500].map(ml =>
          `<button onclick="Water.add(${ml})" style="padding:8px 14px; background:var(--bg3); border:1px solid var(--border);
             border-radius:8px; color:var(--accent3); font-size:12px; font-family:var(--font-head);
             font-weight:700; cursor:pointer; transition:all .15s;"
           onmouseover="this.style.borderColor='var(--accent3)'" onmouseout="this.style.borderColor='var(--border)'">
            +${ml}ml
          </button>`
        ).join('')}
      </div>`;
  },
};

// ─── EXPOSE TO GLOBAL SCOPE ───────────────────────────────────────────────────
window.WeeklyChart  = WeeklyChart;
window.MicroNutrients = MicroNutrients;
window.Barcode      = Barcode;
window.PushNotifications = PushNotifications;
window.Streak       = Streak;
window.Water        = Water;
