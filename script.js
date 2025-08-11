// SkyPulse — No API key weather app for Kolkata + your location
// Data: Open-Meteo Forecast + Reverse Geocoding (no key needed)

const el = (id) => document.getElementById(id);

// Tabs
document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    const panel = document.getElementById(btn.dataset.tab);
    panel.classList.add("active");
  });
});

// Globals
let latestWeather = null;
let quizIndex = 0;
let quizScore = Number(localStorage.getItem("skypulse_best_score") || 0);

// Update badges
el("scoreBadge").textContent = quizScore;
el("quizScore").textContent = quizScore;

// Geolocation with fallback to Kolkata
(async function init() {
  try {
    const coords = await getCoordsWithFallback();
    await loadWeather(coords);
    buildNewsOutlook();
    buildQuiz();
  } catch (e) {
    console.error(e);
    showError("Could not load weather. Please refresh.");
  }
})();

function getCoordsWithFallback() {
  const KOLKATA = { latitude: 22.5726, longitude: 88.3639, fallback: true };
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(KOLKATA);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => resolve(KOLKATA),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 600000 }
    );
  });
}

async function loadWeather({ latitude, longitude, fallback }) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", latitude.toFixed(4));
  url.searchParams.set("longitude", longitude.toFixed(4));
  url.searchParams.set("current", [
    "temperature_2m",
    "relative_humidity_2m",
    "apparent_temperature",
    "is_day",
    "precipitation",
    "weather_code",
    "wind_speed_10m",
    "wind_direction_10m"
  ].join(","));
  url.searchParams.set("daily", [
    "weather_code",
    "temperature_2m_max",
    "temperature_2m_min",
    "precipitation_sum",
    "wind_speed_10m_max",
    "sunrise",
    "sunset"
  ].join(","));
  url.searchParams.set("timezone", "auto");

  const [weather, place] = await Promise.all([
    fetch(url.toString()).then(r => r.json()),
    reverseGeocode(latitude, longitude)
  ]);

  latestWeather = weather;

  // Location label
  const locLabel = place
    ? `${place.name}${place.admin1 ? ", " + place.admin1 : ""}${place.country ? ", " + place.country : ""}`
    : (fallback ? "Kolkata, West Bengal, India" : "Your location");
  el("locationName").textContent = locLabel;

  // Updated time
  const now = new Date();
  el("updatedAt").textContent = `Updated ${now.toLocaleString(undefined, { hour: "2-digit", minute: "2-digit" })}`;

  // Current
  const c = weather.current;
  const unitSpeedKmh = toKmh(c.wind_speed_10m); // m/s -> km/h if needed (Open-Meteo returns km/h by default for wind_speed_10m; safeguard)
  el("currentTemp").textContent = formatC(c.temperature_2m);
  el("feelsLike").textContent = formatC(c.apparent_temperature);
  el("humidity").textContent = `${Math.round(c.relative_humidity_2m)}%`;
  el("wind").textContent = `${Math.round(unitSpeedKmh)} km/h`;
  el("rain").textContent = `${(c.precipitation || 0).toFixed(1)} mm`;
  el("currentSummary").textContent = codeToText(c.weather_code);
  el("statusPill").textContent = c.is_day ? "Daytime" : "Night";

  // Icon
  el("currentIcon").innerHTML = iconForCode(c.weather_code, !!c.is_day, 128);

  // Forecast
  buildForecast(weather.daily);
}

function toKmh(v) {
  // Open-Meteo wind_speed_10m is in km/h by default. If API ever returns m/s, convert:
  // Assume > 60 is km/h already; else return v * 3.6. This keeps UI sensible.
  return v > 60 ? v : v; // keep as-is; API returns km/h
}

async function reverseGeocode(lat, lon) {
  try {
    const url = new URL("https://geocoding-api.open-meteo.com/v1/reverse");
    url.searchParams.set("latitude", lat);
    url.searchParams.set("longitude", lon);
    url.searchParams.set("language", "en");
    url.searchParams.set("format", "json");
    const data = await fetch(url.toString()).then(r => r.json());
    const best = data?.results?.[0];
    if (!best) return null;
    return {
      name: best.name,
      admin1: best.admin1,
      country: best.country_code ? best.country : best.country,
    };
  } catch {
    return null;
  }
}

function buildForecast(daily) {
  const grid = el("forecastGrid");
  grid.innerHTML = "";
  const days = daily.time.length;

  for (let i = 0; i < days; i++) {
    const date = new Date(daily.time[i]);
    const wcode = daily.weather_code[i];
    const tmin = daily.temperature_2m_min[i];
    const tmax = daily.temperature_2m_max[i];
    const rain = daily.precipitation_sum[i] || 0;
    const wmax = daily.wind_speed_10m_max[i] || 0;

    const item = document.createElement("div");
    item.className = "forecast-item";
    item.innerHTML = `
      <div class="f-date">${date.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}</div>
      <div class="f-icon">${iconForCode(wcode, true, 54)}</div>
      <div class="f-temps">${Math.round(tmax)}° / ${Math.round(tmin)}°</div>
      <div class="f-extras">${rain.toFixed(1)} mm · ${Math.round(wmax)} km/h</div>
      <div class="f-desc" title="${codeToText(wcode)}">${codeToText(wcode)}</div>
    `;
    grid.appendChild(item);
  }
}

/* Weather code mapping (WMO) */
function codeToText(code) {
  const map = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    56: "Light freezing drizzle",
    57: "Dense freezing drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    66: "Light freezing rain",
    67: "Heavy freezing rain",
    71: "Slight snow",
    73: "Moderate snow",
    75: "Heavy snow",
    77: "Snow grains",
    80: "Rain showers: slight",
    81: "Rain showers: moderate",
    82: "Rain showers: violent",
    85: "Snow showers: slight",
    86: "Snow showers: heavy",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail"
  };
  return map[code] || "—";
}

/* SVG weather icons (day/night aware) */
function iconForCode(code, isDay, size = 72) {
  const c = String(code);
  const theme = isDay ? "#FFD766" : "#A7B4FF";
  const glow = isDay ? "rgba(255,215,102,0.65)" : "rgba(167,180,255,0.65)";

  const Sun = `
    <svg width="${size}" height="${size}" viewBox="0 0 64 64" class="svg-glow" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="g1" cx="50%" cy="50%">
          <stop offset="0%" stop-color="${theme}"/>
          <stop offset="100%" stop-color="#ff9e55"/>
        </radialGradient>
      </defs>
      <g filter="url(#f)">
        <circle cx="32" cy="32" r="12" fill="url(#g1)"/>
        ${Array.from({length: 8}).map((_,i)=>{
          const a = i * (Math.PI/4);
          const x1 = 32 + Math.cos(a)*18, y1 = 32 + Math.sin(a)*18;
          const x2 = 32 + Math.cos(a)*26, y2 = 32 + Math.sin(a)*26;
          return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${theme}" stroke-width="3" stroke-linecap="round"/>`;
        }).join("")}
      </g>
      <filter id="f"><feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="${glow}"/></filter>
    </svg>`;

  const Moon = `
    <svg width="${size}" height="${size}" viewBox="0 0 64 64" class="svg-glow" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="g2" cx="50%" cy="50%">
          <stop offset="0%" stop-color="#cfd8ff"/>
          <stop offset="100%" stop-color="#97a5ff"/>
        </radialGradient>
      </defs>
      <path d="M41 12a20 20 0 1 0 11 36 18 18 0 1 1 -11 -36z" fill="url(#g2)"/>
      <filter id="f2"><feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="${glow}"/></filter>
    </svg>`;

  const Cloud = (dark=false) => `
    <svg width="${size}" height="${size}" viewBox="0 0 64 64" class="svg-glow" xmlns="http://www.w3.org/2000/svg">
      <path d="M18 40c-6 0-10-4-10-9s4-9 10-9c1 0 2 0 3 0a12 12 0 0 1 22 4h1c5 0 9 4 9 9s-4 9-9 9H18z"
        fill="${dark ? "#7b86b5" : "#a8b4e6"}" />
    </svg>`;

  const Rain = `
    <svg width="${size}" height="${size}" viewBox="0 0 64 64" class="svg-glow" xmlns="http://www.w3.org/2000/svg">
      <g>
        <path d="M18 34c-6 0-10-4-10-9s4-9 10-9c1 0 2 0 3 0a12 12 0 0 1 22 4h1c5 0 9 4 9 9s-4 9-9 9H18z"
          fill="#9fb1ea"/>
        ${[18,28,38,48].map((x,i)=>`<line x1="${x}" y1="${40}" x2="${x-3}" y2="${52}" stroke="#72b4ff" stroke-width="3" stroke-linecap="round"/>`).join("")}
      </g>
    </svg>`;

  const Thunder = `
    <svg width="${size}" height="${size}" viewBox="0 0 64 64" class="svg-glow" xmlns="http://www.w3.org/2000/svg">
      <path d="M18 34c-6 0-10-4-10-9s4-9 10-9c1 0 2 0 3 0a12 12 0 0 1 22 4h1c5 0 9 4 9 9s-4 9-9 9H18z"
        fill="#9fb1ea"/>
      <polygon points="34,36 26,52 34,48 30,60 46,40 36,44" fill="#ffd94a" />
    </svg>`;

  const Snow = `
    <svg width="${size}" height="${size}" viewBox="0 0 64 64" class="svg-glow" xmlns="http://www.w3.org/2000/svg">
      <path d="M18 34c-6 0-10-4-10-9s4-9 10-9c1 0 2 0 3 0a12 12 0 0 1 22 4h1c5 0 9 4 9 9s-4 9-9 9H18z"
        fill="#b6c3f0"/>
      ${[18,28,38,48].map((x)=>`<circle cx="${x}" cy="46" r="2.4" fill="#e9f3ff"/>`).join("")}
    </svg>`;

  const Drizzle = `
    <svg width="${size}" height="${size}" viewBox="0 0 64 64" class="svg-glow" xmlns="http://www.w3.org/2000/svg">
      <path d="M18 34c-6 0-10-4-10-9s4-9 10-9c1 0 2 0 3 0a12 12 0 0 1 22 4h1c5 0 9 4 9 9s-4 9-9 9H18z"
        fill="#a8b4e6"/>
      ${[20,30,40,50].map((x)=>`<circle cx="${x}" cy="48" r="1.7" fill="#9cd1ff"/>`).join("")}
    </svg>`;

  const Fog = `
    <svg width="${size}" height="${size}" viewBox="0 0 64 64" class="svg-glow" xmlns="http://www.w3.org/2000/svg">
      <path d="M18 34c-6 0-10-4-10-9s4-9 10-9c1 0 2 0 3 0a12 12 0 0 1 22 4h1c5 0 9 4 9 9s-4 9-9 9H18z"
        fill="#b7c2e2"/>
      ${[38,44,50].map((y)=>`<rect x="12" y="${y}" width="40" height="3" rx="2" fill="#d6def7" />`).join("")}
    </svg>`;

  // Map codes to icons
  if (c === "0") return isDay ? Sun : Moon;
  if (["1","2"].includes(c)) return isDay ? Sun + Cloud() : Moon + Cloud(true);
  if (c === "3") return Cloud(true);
  if (["45","48"].includes(c)) return Fog;
  if (["51","53","55","56","57"].includes(c)) return Drizzle;
  if (["61","63","65","80","81","82","66","67"].includes(c)) return Rain;
  if (["71","73","75","77","85","86"].includes(c)) return Snow;
  if (["95","96","99"].includes(c)) return Thunder;

  return Cloud();
}

function formatC(v) {
  return `${Math.round(v)}°`;
}

function showError(msg) {
  el("statusPill").textContent = "Error";
  el("currentSummary").textContent = msg;
}

/* NEWS & TIPS: Adaptive outlook bullets based on upcoming week */
function buildNewsOutlook() {
  const pill = el("outlookPill");
  const list = el("outlookBullets");
  list.innerHTML = "";

  if (!latestWeather?.daily) {
    pill.textContent = "—";
    list.innerHTML = "<li>Weekly outlook unavailable.</li>";
    return;
  }

  const d = latestWeather.daily;
  const max = Math.max(...d.temperature_2m_max);
  const rainMax = Math.max(...d.precipitation_sum);
  const windy = Math.max(...d.wind_speed_10m_max);
  const hot = max >= 35;
  const veryWet = rainMax >= 20; // mm/day
  const breezy = windy >= 30; // km/h

  const bullets = [];
  if (hot) bullets.push("Expect hot spells this week. Hydrate, wear light fabrics, and avoid the midday sun.");
  if (veryWet) bullets.push("Heavy rain potential on some days. Carry an umbrella and plan commutes with buffer time.");
  if (breezy) bullets.push("Windy periods expected. Secure loose items on balconies and be cautious near trees.");
  if (!hot && !veryWet && !breezy) bullets.push("A fairly balanced week—great for morning walks and errands.");

  // Simple headline
  if (veryWet) pill.textContent = "Monsoon pulses staying active";
  else if (hot) pill.textContent = "Warm, humid stretches ahead";
  else if (breezy) pill.textContent = "Breezier than usual";
  else pill.textContent = "Mild & manageable";

  bullets.forEach(txt => {
    const li = document.createElement("li");
    li.textContent = txt;
    list.appendChild(li);
  });
}

/* QUIZ: small interactive quiz based on current data */
function buildQuiz() {
  const questions = dynamicQuestionsFromWeather();
  let qIdx = 0;
  let sessionScore = 0;

  const area = el("quizArea");
  const nextBtn = el("nextQuestion");
  const resetBtn = el("resetQuiz");

  function renderQuestion() {
    area.innerHTML = "";
    const q = questions[qIdx];
    if (!q) {
      area.innerHTML = `
        <div class="q-text">All done! Your score this round: <strong>${sessionScore}</strong></div>
        <div>Best Score: <strong>${quizScore}</strong></div>
      `;
      nextBtn.textContent = "Restart";
      return;
    }

    const qt = document.createElement("div");
    qt.className = "q-text";
    qt.textContent = `Q${qIdx+1}. ${q.text}`;
    area.appendChild(qt);

    const opts = document.createElement("div");
    opts.className = "options";
    q.options.forEach((opt, i) => {
      const b = document.createElement("button");
      b.className = "option-btn";
      b.textContent = opt;
      b.addEventListener("click", () => {
        if (b.disabled) return;
        // Evaluate
        const correct = i === q.answer;
        if (correct) {
          b.classList.add("correct");
          sessionScore += 10;
          // Update best score
          if (sessionScore > quizScore) {
            quizScore = sessionScore;
            localStorage.setItem("skypulse_best_score", String(quizScore));
            el("scoreBadge").textContent = quizScore;
          }
        } else {
          b.classList.add("wrong");
        }
        // Lock others
        Array.from(opts.children).forEach(ch => ch.disabled = true);
        el("quizScore").textContent = Math.max(sessionScore, quizScore);
      });
      opts.appendChild(b);
    });
    area.appendChild(opts);
  }

  renderQuestion();

  nextBtn.onclick = () => {
    if (qIdx >= questions.length) {
      // Restart session
      qIdx = 0;
      sessionScore = 0;
      el("quizScore").textContent = Math.max(sessionScore, quizScore);
      nextBtn.textContent = "Next";
    } else {
      qIdx++;
    }
    renderQuestion();
  };

  resetBtn.onclick = () => {
    sessionScore = 0;
    el("quizScore").textContent = Math.max(sessionScore, quizScore);
    qIdx = 0;
    renderQuestion();
  };
}

function dynamicQuestionsFromWeather() {
  const qs = [];

  const cur = latestWeather?.current;
  const daily = latestWeather?.daily;
  const todayIdx = 0;

  if (cur) {
    // Q1: Today's condition
    const desc = codeToText(cur.weather_code);
    const wrongs = ["Overcast", "Heavy rain", "Thunderstorm", "Fog"].filter(w => w !== desc);
    qs.push({
      text: `What's the current condition?`,
      options: shuffle([desc, ...sample(wrongs, 3)]),
      answer: 0 // will fix after shuffle
    });
  }

  if (daily) {
    // Q2: Today's max temperature close guess
    const tmax = Math.round(daily.temperature_2m_max[todayIdx]);
    const opts = shuffle([tmax, tmax - 2, tmax + 2, tmax - 4].map(n => `${n}°`));
    qs.push({
      text: `What's today's forecasted high?`,
      options: opts,
      answer: opts.indexOf(`${tmax}°`)
    });

    // Q3: Rainy or not today
    const rain = (daily.precipitation_sum[todayIdx] || 0);
    const rainYN = rain >= 1 ? "Yes" : "No";
    const opts2 = shuffle(["Yes", "No"]);
    qs.push({
      text: `Is there measurable rain today (≥ 1 mm)?`,
      options: opts2,
      answer: opts2.indexOf(rainYN)
    });

    // Q4: Wind awareness
    const wmax = Math.round(daily.wind_speed_10m_max[todayIdx] || 0);
    const isWindy = wmax >= 30 ? "True" : "False";
    const opts3 = shuffle(["True", "False"]);
    qs.push({
      text: `True/False: Peak wind today is 30+ km/h.`,
      options: opts3,
      answer: opts3.indexOf(isWindy)
    });
  }

  // Q5: Preparedness general
  qs.push({
    text: "Best monsoon habit:",
    options: shuffle([
      "Carry a compact umbrella and waterproof bag",
      "Wear heavy denim daily",
      "Ignore thunder and head to rooftops",
      "Charge your phone only during storms"
    ]),
    answer: 0
  });

  // Fix the first question's answer index if needed
  if (cur) {
    const first = qs[0];
    const correctText = codeToText(cur.weather_code);
    first.answer = first.options.indexOf(correctText);
  }

  return qs;
}

/* Utilities */
function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}
function sample(arr, n) {
  const copy = [...arr];
  const out = [];
  while (out.length < n && copy.length) {
    out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  }
  return out;
}