// ============================================================================
// NEXUS HUB • MOTOR PRINCIPAL CON SINCRONIZACIÓN EN SUPABASE (PARTE 1/2)
// ============================================================================

const STORAGE_KEY = "nexus_hub_v2_data";
const INITIAL_PIN_CODE = "2026";
const INITIAL_ACCESS_KEY = "2027_uno";
const LEGACY_BAD_HASH = "e7000729004e59994e2bc174c31247d646ba3c46bc7bc537803893bb18ba2d73";

const SUPABASE_URL = "https://ujsvjccnhjrchovjbkjy.supabase.co";
const SUPABASE_KEY = "sb_publishable_6x9uXjKp1wAec2UT-KGutA_5oNY9JEZ";
const SUPABASE_ROW_ID = "main";

async function sha256Hex(texto) {
  const limpio = String(texto ?? "").trim();
  if (window.crypto && window.crypto.subtle) {
    const data = new TextEncoder().encode(limpio);
    const buf = await window.crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  let h = 2166136261;
  for (let i = 0; i < limpio.length; i++) {
    h ^= limpio.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function crearEstadoInicial() {
  return {
    pinHash: "",
    accessKeyHash: "",
    unlockedSession: false,
    currentAlias: "",
    updatedAt: 0,
    items: [
      {
        id: "item-1",
        category: "peliculas",
        title: "La Emperatriz Divorciada • Cap. 10",
        code: "EMP-1010",
        url: "https://drive.google.com/",
        imgUrl: "",
        banner: "¡Disponible en la bóveda! Resuelve la matriz para obtener el código.",
        featured: true
      },
      {
        id: "item-2",
        category: "series",
        title: "Baki-Dou • Selección Especial",
        code: "BAKI-2026",
        url: "https://drive.google.com/",
        imgUrl: "",
        banner: "Nueva entrada en Series/Anime con reto de memoria.",
        featured: true
      },
      {
        id: "item-3",
        category: "archivos",
        title: "Pack de Recursos, Libros & Plantillas",
        code: "PACK-777",
        url: "https://drive.google.com/",
        imgUrl: "",
        banner: "Archivo o recurso listo para desbloquear desde la Bóveda.",
        featured: false
      }
    ],
    polls: [
      {
        id: "poll-1",
        question: "¿Qué subimos o habilitamos primero esta semana?",
        options: [
          { id: "opt-1", text: "Película o serie nueva", votes: 0 },
          { id: "opt-2", text: "Libro o archivo especial", votes: 0 }
        ],
        votedBy: []
      }
    ],
    requests: [],
    visits: []
  };
}

function normalizarEstado(parsed) {
  const base = crearEstadoInicial();
  if (!parsed || typeof parsed !== "object") return base;
  return {
    pinHash: parsed.pinHash || "",
    accessKeyHash: parsed.accessKeyHash || "",
    unlockedSession: Boolean(parsed.unlockedSession),
    currentAlias: parsed.currentAlias || "",
    updatedAt: Number(parsed.updatedAt) || 0,
    items: Array.isArray(parsed.items) ? parsed.items : base.items,
    polls: Array.isArray(parsed.polls) ? parsed.polls : base.polls,
    requests: Array.isArray(parsed.requests) ? parsed.requests : [],
    visits: Array.isArray(parsed.visits) ? parsed.visits : []
  };
}

function cargarEstadoLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const inicial = crearEstadoInicial();
      guardarEstadoLocal(inicial);
      return inicial;
    }
    return normalizarEstado(JSON.parse(raw));
  } catch (err) {
    return crearEstadoInicial();
  }
}

function guardarEstadoLocal(estado) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(estado));
  } catch (err) {}
}

let state = cargarEstadoLocal();
let guardandoNube = false;

async function subirEstadoNube(estado) {
  if (!SUPABASE_URL || !SUPABASE_KEY || guardandoNube) return;
  guardandoNube = true;
  try {
    const payloadCompartido = {
      pinHash: estado.pinHash || "",
      accessKeyHash: estado.accessKeyHash || "",
      updatedAt: Number(estado.updatedAt) || Date.now(),
      items: Array.isArray(estado.items) ? estado.items : [],
      polls: Array.isArray(estado.polls) ? estado.polls : [],
      requests: Array.isArray(estado.requests) ? estado.requests : [],
      visits: Array.isArray(estado.visits) ? estado.visits : []
    };

    const headers = {
      "Content-Type": "application/json",
      apikey: SUPABASE_KEY,
      Authorization: "Bearer " + SUPABASE_KEY,
      Prefer: "return=minimal"
    };

    const patchUrl = `${SUPABASE_URL}/rest/v1/nexus_state?id=eq.${encodeURIComponent(SUPABASE_ROW_ID)}`;
    let res = await fetch(patchUrl, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        payload: payloadCompartido,
        updated_at: new Date().toISOString()
      })
    });

    if (!res.ok) {
      await fetch(`${SUPABASE_URL}/rest/v1/nexus_state`, {
        method: "POST",
        headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          id: SUPABASE_ROW_ID,
          payload: payloadCompartido,
          updated_at: new Date().toISOString()
        })
      });
    }
  } catch (e) {
    console.warn("Sin conexión temporal a Supabase, guardado local activo.");
  } finally {
    guardandoNube = false;
  }
}

function guardarEstado(estado) {
  estado.updatedAt = Date.now();
  guardarEstadoLocal(estado);
  subirEstadoNube(estado);
}

async function sincronizarDesdeNube() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  try {
    const url = `${SUPABASE_URL}/rest/v1/nexus_state?id=eq.${encodeURIComponent(SUPABASE_ROW_ID)}&select=payload`;
    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: "Bearer " + SUPABASE_KEY
      }
    });
    if (!res.ok) return;
    const filas = await res.json();
    const nube = filas && filas[0] && filas[0].payload;
    if (!nube || typeof nube !== "object" || !Object.keys(nube).length) {
      await subirEstadoNube(state);
      return;
    }
    const nubeNorm = normalizarEstado(nube);
    if (nubeNorm.updatedAt >= (Number(state.updatedAt) || 0)) {
      state = {
        ...state,
        pinHash: nubeNorm.pinHash || state.pinHash,
        accessKeyHash: nubeNorm.accessKeyHash || state.accessKeyHash,
        updatedAt: nubeNorm.updatedAt,
        items: nubeNorm.items,
        polls: nubeNorm.polls,
        requests: nubeNorm.requests,
        visits: nubeNorm.visits
      };
      guardarEstadoLocal(state);
      renderizarTodo();
    } else {
      await subirEstadoNube(state);
    }
  } catch (e) {}
}

function escaparHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function limpiarUrlImagen(url) {
  const limpio = String(url ?? "").trim();
  if (!limpio) return "";
  if (/^https?:\/\//i.test(limpio)) return limpio;
  return "";
}

// --- AUDIO SINTETIZADO ---
let audioCtx = null;

function sonar(frecInicio = 520, frecFin = 760, tipo = "sine", duracion = 0.14, volumen = 0.1) {
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }
    const ahora = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = tipo;
    osc.frequency.setValueAtTime(frecInicio, ahora);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, frecFin), ahora + duracion);
    gain.gain.setValueAtTime(volumen, ahora);
    gain.gain.exponentialRampToValueAtTime(0.0008, ahora + duracion);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(ahora);
    osc.stop(ahora + duracion);
  } catch (e) {}
}

// --- MOTOR DE PARTÍCULAS TÁCTILES ---
const fxCanvas = document.getElementById("fx-canvas");
const fxCtx = fxCanvas ? fxCanvas.getContext("2d") : null;
let chispas = [];

function ajustarCanvasFx() {
  if (!fxCanvas) return;
  fxCanvas.width = window.innerWidth;
  fxCanvas.height = window.innerHeight;
}

ajustarCanvasFx();
window.addEventListener("resize", ajustarCanvasFx);

function emitirChispas(x, y, total = 10) {
  if (!fxCtx) return;
  for (let i = 0; i < total; i++) {
    const ang = Math.random() * Math.PI * 2;
    const vel = Math.random() * 3.2 + 0.8;
    chispas.push({
      x,
      y,
      vx: Math.cos(ang) * vel,
      vy: Math.sin(ang) * vel - 0.6,
      r: Math.random() * 2.6 + 1.2,
      vida: 1
    });
  }
}

window.addEventListener("pointerdown", (e) => {
  emitirChispas(e.clientX, e.clientY, 10);
  sonar(480, 620, "sine", 0.08, 0.05);
});

(function animarFx() {
  if (fxCtx && fxCanvas) {
    fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
    for (let i = chispas.length - 1; i >= 0; i--) {
      const p = chispas[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vida -= 0.032;
      if (p.vida <= 0) {
        chispas.splice(i, 1);
        continue;
      }
      fxCtx.beginPath();
      fxCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      fxCtx.fillStyle = `rgba(56, 189, 248, ${p.vida})`;
      fxCtx.fill();
    }
  }
  requestAnimationFrame(animarFx);
})();

// --- ACCESO CON ALIAS + CLAVE UNIVERSAL ---
const gateScreen = document.getElementById("gate-screen");
const hubMain = document.getElementById("hub-main");
const userBadge = document.getElementById("user-badge");
const inpAlias = document.getElementById("inp-alias");
const inpAccessKey = document.getElementById("inp-access-key");
const gateMsg = document.getElementById("gate-msg");

function formatearHora(ts) {
  try {
    return new Date(ts).toLocaleString([], {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch (e) {
    return "";
  }
}

function registrarVisita(alias) {
  state.visits.unshift({
    id: "vis-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
    alias,
    time: Date.now()
  });
  if (state.visits.length > 100) {
    state.visits = state.visits.slice(0, 100);
  }
  guardarEstado(state);
}

async function asegurarClaveUniversalInicial() {
  if (!state.accessKeyHash) {
    state.accessKeyHash = await sha256Hex(INITIAL_ACCESS_KEY);
    guardarEstadoLocal(state);
  }
  return state.accessKeyHash;
}

async function intentarIngreso(aliasRaw, claveRaw, grabarVisita = true) {
  await sincronizarDesdeNube();
  const alias = String(aliasRaw ?? "").trim();
  const clave = String(claveRaw ?? "").trim();

  if (!alias) {
    gateMsg.className = "feedback err";
    gateMsg.textContent = "Escribe tu alias o nombre para entrar.";
    sonar(220, 120, "sawtooth", 0.14, 0.08);
    return;
  }

  if (!clave) {
    gateMsg.className = "feedback err";
    gateMsg.textContent = "Ingresa la clave de acceso del centro.";
    sonar(220, 120, "sawtooth", 0.14, 0.08);
    return;
  }

  const hashEsperado = await asegurarClaveUniversalInicial();
  const hashIntento = await sha256Hex(clave);

  if (hashIntento !== hashEsperado) {
    gateMsg.className = "feedback err";
    gateMsg.textContent = "Clave de acceso incorrecta. Solicítala al administrador.";
    sonar(180, 80, "sawtooth", 0.18, 0.1);
    return;
  }

  state.currentAlias = alias;
  state.unlockedSession = true;
  guardarEstadoLocal(state);

  if (grabarVisita) {
    registrarVisita(alias);
  }

  inpAccessKey.value = "";
  userBadge.textContent = "VISITANTE: " + alias.toUpperCase();
  gateScreen.classList.add("hidden");
  hubMain.classList.remove("hidden");
  gateMsg.textContent = "";
  renderizarTodo();
  sonar(523, 784, "triangle", 0.18, 0.1);
}

document.getElementById("btn-enter-hub").addEventListener("click", () => {
  intentarIngreso(inpAlias.value, inpAccessKey.value, true);
});

inpAccessKey.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    intentarIngreso(inpAlias.value, inpAccessKey.value, true);
  }
});

document.getElementById("btn-change-alias").addEventListener("click", () => {
  inpAlias.value = state.currentAlias || "";
  inpAccessKey.value = "";
  state.unlockedSession = false;
  guardarEstadoLocal(state);
  hubMain.classList.add("hidden");
  gateScreen.classList.remove("hidden");
});

// --- NAVEGACIÓN ENTRE APARTADOS ---
const tabButtons = document.querySelectorAll(".tab-btn");
const tabViews = document.querySelectorAll(".tab-view");

function cambiarPestanaPrincipal(tabId) {
  tabButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabId);
  });
  tabViews.forEach((sec) => {
    sec.classList.toggle("hidden", sec.id !== tabId);
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => cambiarPestanaPrincipal(btn.dataset.tab));
});

document.querySelectorAll("[data-jump]").forEach((card) => {
  card.addEventListener("click", () => cambiarPestanaPrincipal(card.dataset.jump));
});

// --- CARTELERA DESLIZANTE CON IMAGEN ESPEJO POR URL ---
const billboardTrack = document.getElementById("billboard-track");
const billboardDots = document.getElementById("billboard-dots");
let slideIndex = 0;

function obtenerDestacados() {
  const dest = state.items.filter((it) => it.featured);
  return dest.length > 0 ? dest : state.items.slice(0, 1);
}

function actualizarCarrusel() {
  const slides = obtenerDestacados();
  if (!slides.length) {
    billboardTrack.innerHTML = `<div class="slide-card"><div class="slide-title">Sin destacados</div><div class="slide-banner">Abre el panel de administrador para agregar contenido.</div></div>`;
    billboardDots.innerHTML = "";
    return;
  }
  if (slideIndex >= slides.length) slideIndex = 0;
  if (slideIndex < 0) slideIndex = slides.length - 1;

  billboardTrack.style.transform = `translateX(-${slideIndex * 100}%)`;
  billboardDots.innerHTML = slides
    .map((_, idx) => `<span class="dot ${idx === slideIndex ? "active" : ""}"></span>`)
    .join("");
}

function renderizarCartelera() {
  const slides = obtenerDestacados();
  if (!slides.length) {
    actualizarCarrusel();
    return;
  }
  billboardTrack.innerHTML = slides
    .map((item, i) => {
      const imgSegura = limpiarUrlImagen(item.imgUrl);
      const bloqueImg = imgSegura
        ? `<img class="slide-mirror-img" src="${escaparHtml(imgSegura)}" alt="${escaparHtml(item.title)}" onerror="this.style.display='none'" />`
        : "";
      return `
        <div class="slide-card">
          <div class="tag">${escaparHtml(item.category.toUpperCase())}</div>
          <div class="slide-title">${escaparHtml(item.title)}</div>
          ${bloqueImg}
          <div class="slide-banner">${escaparHtml(item.banner || "Disponible para desbloquear en la Bóveda.")}</div>
          <button class="btn btn-primary btn-ir-item" data-id="${item.id}" data-slide="${i}">⚡ Ir a Desbloquear</button>
        </div>
      `;
    })
    .join("");

  billboardTrack.querySelectorAll(".btn-ir-item").forEach((b) => {
    b.addEventListener("click", () => {
      const target = state.items.find((x) => x.id === b.dataset.id);
      if (target) {
        cambiarPestanaPrincipal("tab-boveda");
        seleccionarCategoriaBoveda(target.category);
        abrirRetoDeElemento(target);
      }
    });
  });

  actualizarCarrusel();
}

document.getElementById("prev-slide").addEventListener("click", () => {
  slideIndex--;
  actualizarCarrusel();
});

document.getElementById("next-slide").addEventListener("click", () => {
  slideIndex++;
  actualizarCarrusel();
});

// ============================================================================
// NEXUS HUB • BÓVEDA, CANALES, VOTACIONES, ADMIN Y NUBE (PARTE 2/2)
// ============================================================================

let categoriaActiva = "peliculas";
let elementoSeleccionado = null;

const catTitulos = {
  peliculas: "Catálogo de Películas",
  series: "Catálogo de Series / Anime",
  archivos: "Catálogo de Archivos y Libros"
};

function seleccionarCategoriaBoveda(cat) {
  categoriaActiva = cat;
  document.querySelectorAll("#vault-categories .sub-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.cat === cat);
  });
  document.getElementById("vault-cat-title").textContent = catTitulos[cat] || "Catálogo";
  document.getElementById("vault-challenge-view").classList.add("hidden");
  document.getElementById("vault-list-view").classList.remove("hidden");
  renderizarListaBoveda();
}

document.querySelectorAll("#vault-categories .sub-btn").forEach((btn) => {
  btn.addEventListener("click", () => seleccionarCategoriaBoveda(btn.dataset.cat));
});

function renderizarListaBoveda() {
  const cont = document.getElementById("vault-items-list");
  const filtrados = state.items.filter((it) => it.category === categoriaActiva);
  if (!filtrados.length) {
    cont.innerHTML = `<div class="muted small">No hay elementos cargados en esta categoría todavía.</div>`;
    return;
  }
  cont.innerHTML = filtrados
    .map(
      (it) => `
      <div class="item-card">
        <div>
          <strong>${escaparHtml(it.title)}</strong>
          <div class="item-meta">${escaparHtml(it.banner || "Requiere prueba de concentración")}</div>
        </div>
        <button class="btn btn-secondary btn-abrir-reto" style="width:auto;" data-id="${it.id}">Entrar</button>
      </div>
    `
    )
    .join("");

  cont.querySelectorAll(".btn-abrir-reto").forEach((btn) => {
    btn.addEventListener("click", () => {
      const encontrado = state.items.find((x) => x.id === btn.dataset.id);
      if (encontrado) abrirRetoDeElemento(encontrado);
    });
  });
}

// --- MINIJUEGO MATRIZ 4x4 ---
const matrixGrid = document.getElementById("matrix-grid");
const matrixLevelEl = document.getElementById("matrix-level");
const matrixInstrEl = document.getElementById("matrix-instruction");
const matrixMsgEl = document.getElementById("matrix-msg");
const btnStartMatrix = document.getElementById("btn-start-matrix");

let secuenciaObjetivo = [];
let pasoJugador = 0;
let rondaMatriz = 1;
let bloqueadoMatriz = true;
let retoSuperado = false;

function construirTableroMatriz() {
  matrixGrid.innerHTML = "";
  for (let i = 0; i < 16; i++) {
    const cel = document.createElement("button");
    cel.type = "button";
    cel.className = "cell-btn";
    cel.dataset.idx = String(i);
    cel.textContent = String(i + 1);
    cel.addEventListener("click", () => manejarClicCelda(i, cel));
    matrixGrid.appendChild(cel);
  }
}

construirTableroMatriz();

function iluminarCelda(idx, clase = "lit", dur = 360) {
  const cel = matrixGrid.querySelector(`[data-idx="${idx}"]`);
  if (!cel) return;
  cel.classList.add(clase);
  sonar(320 + idx * 35, 460 + idx * 35, "triangle", 0.14, 0.08);
  setTimeout(() => cel.classList.remove(clase), dur);
}

function reproducirPatronesMatriz() {
  bloqueadoMatriz = true;
  pasoJugador = 0;
  matrixInstrEl.textContent = "Observa con atención el orden de las celdas...";
  secuenciaObjetivo.forEach((celIdx, i) => {
    setTimeout(() => {
      iluminarCelda(celIdx, "lit", 360);
      if (i === secuenciaObjetivo.length - 1) {
        setTimeout(() => {
          bloqueadoMatriz = false;
          matrixInstrEl.textContent = `Repite la secuencia (${secuenciaObjetivo.length} toques).`;
        }, 420);
      }
    }, (i + 1) * 560);
  });
}

function iniciarRondaMatriz() {
  matrixLevelEl.textContent = `Nivel ${rondaMatriz} / 2`;
  const cantidad = rondaMatriz === 1 ? 3 : 5;
  secuenciaObjetivo = [];
  for (let i = 0; i < cantidad; i++) {
    secuenciaObjetivo.push(Math.floor(Math.random() * 16));
  }
  reproducirPatronesMatriz();
}

function manejarClicCelda(idx, cel) {
  if (bloqueadoMatriz || retoSuperado) return;
  if (idx === secuenciaObjetivo[pasoJugador]) {
    pasoJugador++;
    iluminarCelda(idx, "ok-hit", 220);
    if (pasoJugador >= secuenciaObjetivo.length) {
      bloqueadoMatriz = true;
      if (rondaMatriz < 2) {
        rondaMatriz++;
        matrixMsgEl.className = "feedback ok";
        matrixMsgEl.textContent = "¡Nivel 1 superado! Prepárate para el Nivel 2...";
        setTimeout(() => {
          matrixMsgEl.textContent = "";
          iniciarRondaMatriz();
        }, 850);
      } else {
        retoSuperado = true;
        btnStartMatrix.disabled = false;
        matrixMsgEl.className = "feedback ok";
        matrixMsgEl.textContent = "¡Prueba superada! Aquí tienes tu código de acceso:";
        const earnedBox = document.getElementById("code-earned-box");
        earnedBox.classList.remove("hidden");
        document.getElementById("earned-code-text").textContent = elementoSeleccionado.code;
        sonar(587, 1046, "triangle", 0.25, 0.12);
      }
    }
  } else {
    bloqueadoMatriz = true;
    cel.style.background = "var(--err)";
    setTimeout(() => { cel.style.background = ""; }, 300);
    sonar(180, 80, "sawtooth", 0.2, 0.1);
    matrixMsgEl.className = "feedback err";
    matrixMsgEl.textContent = "Secuencia incorrecta. Observa otra vez...";
    setTimeout(() => {
      matrixMsgEl.textContent = "";
      reproducirPatronesMatriz();
    }, 950);
  }
}

btnStartMatrix.addEventListener("click", () => {
  retoSuperado = false;
  rondaMatriz = 1;
  btnStartMatrix.disabled = true;
  matrixMsgEl.textContent = "";
  document.getElementById("code-earned-box").classList.add("hidden");
  iniciarRondaMatriz();
});

function abrirRetoDeElemento(item) {
  elementoSeleccionado = item;
  retoSuperado = false;
  rondaMatriz = 1;
  bloqueadoMatriz = true;
  btnStartMatrix.disabled = false;

  document.getElementById("vault-list-view").classList.add("hidden");
  document.getElementById("vault-challenge-view").classList.remove("hidden");
  document.getElementById("selected-item-cat").textContent = item.category.toUpperCase();
  document.getElementById("selected-item-title").textContent = item.title;
  document.getElementById("matrix-level").textContent = "Nivel 1 / 2";
  document.getElementById("matrix-instruction").textContent =
    'Pulsa "Iniciar Secuencia", memoriza las celdas iluminadas y repítelas en orden.';
  matrixMsgEl.textContent = "";
  document.getElementById("code-earned-box").classList.add("hidden");
  document.getElementById("inp-vault-code").value = "";
  document.getElementById("redeem-msg").textContent = "";
  document.getElementById("drive-result-box").classList.add("hidden");
  document.getElementById("copy-drive-msg").textContent = "";
}

document.getElementById("btn-back-vault").addEventListener("click", () => {
  bloqueadoMatriz = true;
  elementoSeleccionado = null;
  document.getElementById("vault-challenge-view").classList.add("hidden");
  document.getElementById("vault-list-view").classList.remove("hidden");
});

document.getElementById("btn-verify-code").addEventListener("click", () => {
  const redeemMsg = document.getElementById("redeem-msg");
  if (!elementoSeleccionado) return;
  const ingresado = document.getElementById("inp-vault-code").value.trim().toUpperCase();
  const esperado = String(elementoSeleccionado.code || "").trim().toUpperCase();

  if (!ingresado) {
    redeemMsg.className = "feedback err";
    redeemMsg.textContent = "Escribe o pega el código obtenido tras superar el reto.";
    return;
  }

  if (ingresado === esperado) {
    redeemMsg.className = "feedback ok";
    redeemMsg.textContent = "Código válido. Enlace habilitado:";
    const box = document.getElementById("drive-result-box");
    box.classList.remove("hidden");
    const urlLimpia = elementoSeleccionado.url || "https://drive.google.com/";
    document.getElementById("final-drive-url").textContent = urlLimpia;
    document.getElementById("btn-open-drive").href = urlLimpia;
    sonar(659, 1174, "triangle", 0.22, 0.12);
  } else {
    redeemMsg.className = "feedback err";
    redeemMsg.textContent = "El código no coincide con este elemento.";
    sonar(180, 90, "sawtooth", 0.16, 0.09);
  }
});

document.getElementById("btn-copy-drive").addEventListener("click", async () => {
  const url = document.getElementById("final-drive-url").textContent;
  const msg = document.getElementById("copy-drive-msg");
  try {
    await navigator.clipboard.writeText(url);
  } catch (e) {
    const aux = document.createElement("input");
    aux.value = url;
    document.body.appendChild(aux);
    aux.select();
    document.execCommand("copy");
    document.body.removeChild(aux);
  }
  msg.textContent = "¡Enlace copiado al portapapeles!";
  sonar(700, 920, "sine", 0.12, 0.08);
});

// --- CANALES Y PETICIONES ---
const channelMeta = {
  "pedir-peli": {
    tag: "CANAL #PEDIR-PELÍCULA / SERIE",
    title: "Solicitar Película o Serie",
    desc: "Escribe el nombre de lo que deseas que el administrador agregue o revise."
  },
  "pedir-archivo": {
    tag: "CANAL #PEDIR-ARCHIVO / LIBRO",
    title: "Solicitar Archivo, Libro o Recurso",
    desc: "Indica qué archivo, libro o recurso necesitas y agrega detalles útiles."
  },
  preguntas: {
    tag: "CANAL #PREGUNTAS-TABLÓN",
    title: "Preguntas, Correcciones o Mensajes",
    desc: "Deja una duda, aviso de enlace o comentario para el administrador."
  }
};

let canalActivo = "pedir-peli";

document.querySelectorAll("#channel-tabs .sub-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    canalActivo = btn.dataset.channel;
    document.querySelectorAll("#channel-tabs .sub-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.channel === canalActivo);
    });
    const meta = channelMeta[canalActivo];
    document.getElementById("channel-tag").textContent = meta.tag;
    document.getElementById("channel-title").textContent = meta.title;
    document.getElementById("channel-desc").textContent = meta.desc;
    document.getElementById("req-msg").textContent = "";
    renderizarFeedCanal();
  });
});

function renderizarFeedCanal() {
  const feedEl = document.getElementById("channel-feed");
  const lista = state.requests.filter((r) => r.channel === canalActivo);
  if (!lista.length) {
    feedEl.innerHTML = `<div class="muted small">Aún no hay publicaciones en este canal.</div>`;
    return;
  }
  feedEl.innerHTML = lista
    .map((r) => {
      const respHtml = r.adminReply
        ? `<div class="admin-reply-box"><div class="admin-reply-label">Respuesta del Administrador</div>${escaparHtml(r.adminReply)}</div>`
        : "";
      return `
        <div class="feed-card column-card">
          <div>
            <strong>${escaparHtml(r.title)}</strong>
            ${r.detail ? `<div class="item-meta">${escaparHtml(r.detail)}</div>` : ""}
            <div class="item-meta">Por ${escaparHtml(r.alias)} • ${escaparHtml(formatearHora(r.time))}</div>
            ${respHtml}
          </div>
        </div>
      `;
    })
    .join("");
}

document.getElementById("btn-send-request").addEventListener("click", async () => {
  await sincronizarDesdeNube();
  const inpTitle = document.getElementById("inp-req-title");
  const inpDetail = document.getElementById("inp-req-detail");
  const reqMsg = document.getElementById("req-msg");
  const titulo = inpTitle.value.trim();
  const detalle = inpDetail.value.trim();

  if (!titulo) {
    reqMsg.className = "feedback err";
    reqMsg.textContent = "Escribe al menos el título o asunto de tu solicitud.";
    sonar(220, 120, "sawtooth", 0.14, 0.08);
    return;
  }

    state.requests.unshift({
    id: "req-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
    channel: canalActivo,
    alias: state.currentAlias || "Visitante",
    title: titulo,
    detail: detalle,
    adminReply: "",
    time: Date.now()
  });

  if (state.requests.length > 200) {
    state.requests = state.requests.slice(0, 200);
  }

  guardarEstado(state);
  inpTitle.value = "";
  inpDetail.value = "";
  reqMsg.className = "feedback ok";
  reqMsg.textContent = "Enviado y sincronizado con la nube.";
  sonar(587, 880, "triangle", 0.16, 0.09);
  renderizarFeedCanal();
});

// --- VOTACIONES / ENCUESTAS LIBRES ---
function renderizarVotaciones() {
  const cont = document.getElementById("polls-feed");
  if (!cont) return;
  if (!Array.isArray(state.polls) || !state.polls.length) {
    cont.innerHTML = `<div class="panel muted small">No hay encuestas activas por ahora.</div>`;
    return;
  }

  const votanteKey = (state.currentAlias || "invitado").toLowerCase();

  cont.innerHTML = state.polls
    .map((poll) => {
      const totalVotos = poll.options.reduce((acc, o) => acc + (Number(o.votes) || 0), 0);
      const yaVoto = Array.isArray(poll.votedBy) && poll.votedBy.includes(votanteKey);

      const opcionesHtml = poll.options
        .map((opt) => {
          const votos = Number(opt.votes) || 0;
          const pct = totalVotos > 0 ? Math.round((votos / totalVotos) * 100) : 0;
          return `
            <button type="button" class="poll-option-btn ${yaVoto ? "voted" : ""}" data-poll="${poll.id}" data-opt="${opt.id}">
              <div style="display:flex; justify-content:space-between; gap:8px;">
                <span>${escaparHtml(opt.text)}</span>
                <span>${votos} (${pct}%)</span>
              </div>
              <div class="poll-bar-wrap"><div class="poll-bar-fill" style="width:${pct}%;"></div></div>
            </button>
          `;
        })
        .join("");

      return `
        <div class="poll-card">
          <strong>${escaparHtml(poll.question)}</strong>
          <div class="item-meta">Total de votos: ${totalVotos} ${yaVoto ? "• Ya registraste tu voto" : ""}</div>
          ${opcionesHtml}
        </div>
      `;
    })
    .join("");

  cont.querySelectorAll(".poll-option-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await sincronizarDesdeNube();
      const poll = state.polls.find((p) => p.id === btn.dataset.poll);
      if (!poll) return;
      if (!Array.isArray(poll.votedBy)) poll.votedBy = [];
      if (poll.votedBy.includes(votanteKey)) {
        sonar(240, 180, "sine", 0.1, 0.06);
        return;
      }
      const opt = poll.options.find((o) => o.id === btn.dataset.opt);
      if (!opt) return;
      opt.votes = (Number(opt.votes) || 0) + 1;
      poll.votedBy.push(votanteKey);
      guardarEstado(state);
      renderizarVotaciones();
      sonar(587, 880, "triangle", 0.15, 0.09);
    });
  });
}

// --- PANEL DE ADMINISTRADOR ---
let toquesNucleo = 0;
let timerToques = null;
const adminLoginModal = document.getElementById("admin-login-modal");
const adminPanelModal = document.getElementById("admin-panel-modal");
const inpAdminPin = document.getElementById("inp-admin-pin");
const adminLoginMsg = document.getElementById("admin-login-msg");

document.getElementById("admin-trigger").addEventListener("click", () => {
  toquesNucleo++;
  clearTimeout(timerToques);
  timerToques = setTimeout(() => { toquesNucleo = 0; }, 1800);
  if (toquesNucleo >= 5) {
    toquesNucleo = 0;
    inpAdminPin.value = "";
    adminLoginMsg.textContent = "";
    adminLoginModal.classList.remove("hidden");
    sonar(660, 990, "sine", 0.16, 0.1);
  }
});

document.getElementById("btn-close-admin-login").addEventListener("click", () => {
  adminLoginModal.classList.add("hidden");
});

async function validarAccesoAdmin() {
  await sincronizarDesdeNube();
  const pinIngresado = String(inpAdminPin.value ?? "").trim();
  if (!pinIngresado) {
    adminLoginMsg.className = "feedback err";
    adminLoginMsg.textContent = "Introduce tu PIN.";
    return;
  }
  const hashIntento = await sha256Hex(pinIngresado);
  const hashInicialOficial = await sha256Hex(INITIAL_PIN_CODE);
  if (!state.pinHash || state.pinHash === LEGACY_BAD_HASH) {
    state.pinHash = hashInicialOficial;
    guardarEstado(state);
  }
  if (hashIntento === state.pinHash) {
    adminLoginModal.classList.add("hidden");
    adminPanelModal.classList.remove("hidden");
    resetearFormularioAdmin();
    renderizarPanelAdmin();
    sonar(523, 1046, "triangle", 0.2, 0.11);
  } else {
    adminLoginMsg.className = "feedback err";
    adminLoginMsg.textContent = "PIN incorrecto.";
    sonar(170, 75, "sawtooth", 0.18, 0.1);
  }
}

document.getElementById("btn-confirm-admin-pin").addEventListener("click", validarAccesoAdmin);
inpAdminPin.addEventListener("keypress", (e) => { if (e.key === "Enter") validarAccesoAdmin(); });
document.getElementById("btn-exit-admin").addEventListener("click", () => {
  adminPanelModal.classList.add("hidden");
  renderizarTodo();
});

document.querySelectorAll("#admin-tabs .sub-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const targetId = btn.dataset.admtab;
    document.querySelectorAll("#admin-tabs .sub-btn").forEach((b) => b.classList.toggle("active", b.dataset.admtab === targetId));
    document.querySelectorAll(".adm-view").forEach((v) => v.classList.toggle("hidden", v.id !== targetId));
  });
});

function resetearFormularioAdmin() {
  document.getElementById("adm-edit-id").value = "";
  document.getElementById("adm-form-heading").textContent = "Agregar Nuevo Elemento";
  document.getElementById("adm-cat").value = "peliculas";
  document.getElementById("adm-title").value = "";
  document.getElementById("adm-code").value = "";
  document.getElementById("adm-url").value = "";
  document.getElementById("adm-img").value = "";
  document.getElementById("adm-banner").value = "";
  document.getElementById("adm-featured").checked = true;
  document.getElementById("btn-cancel-edit").classList.add("hidden");
}

document.getElementById("btn-save-item").addEventListener("click", () => {
  const editId = document.getElementById("adm-edit-id").value.trim();
  const category = document.getElementById("adm-cat").value;
  const title = document.getElementById("adm-title").value.trim();
  const code = document.getElementById("adm-code").value.trim().toUpperCase();
  const url = document.getElementById("adm-url").value.trim() || "https://drive.google.com/";
  const imgUrl = limpiarUrlImagen(document.getElementById("adm-img").value);
  const banner = document.getElementById("adm-banner").value.trim();
  const featured = document.getElementById("adm-featured").checked;
  const msgEl = document.getElementById("adm-item-msg");

  if (!title || !code) {
    msgEl.className = "feedback err";
    msgEl.textContent = "Completa al menos el título y el código de desbloqueo.";
    return;
  }
  const datoItem = { category, title, code, url, imgUrl, banner, featured };
  if (editId) {
    const idx = state.items.findIndex((x) => x.id === editId);
    if (idx !== -1) state.items[idx] = { id: editId, ...datoItem };
    msgEl.className = "feedback ok";
    msgEl.textContent = "Elemento actualizado correctamente.";
  } else {
    state.items.unshift({ id: "item-" + Date.now() + "-" + Math.random().toString(36).slice(2, 5), ...datoItem });
    msgEl.className = "feedback ok";
    msgEl.textContent = "Nuevo elemento agregado.";
  }
  guardarEstado(state);
  resetearFormularioAdmin();
  renderizarListaAdminItems();
  renderizarTodo();
  sonar(587, 880, "triangle", 0.15, 0.09);
});

document.getElementById("btn-cancel-edit").addEventListener("click", resetearFormularioAdmin);

function renderizarListaAdminItems() {
  const listEl = document.getElementById("adm-items-list");
  if (!state.items.length) {
    listEl.innerHTML = `<div class="muted small">No hay elementos creados.</div>`;
    return;
  }
  listEl.innerHTML = state.items.map((it) => `
    <div class="item-card">
      <div>
        <strong>${escaparHtml(it.title)}</strong>
        <div class="item-meta">${escaparHtml(it.category.toUpperCase())} • Código: ${escaparHtml(it.code)} ${it.featured ? "• Cartelera" : ""} ${it.imgUrl ? "• Con Img" : ""}</div>
      </div>
      <div style="display:flex; gap:6px;">
        <button class="btn-chip btn-edit-item" data-id="${it.id}">Editar</button>
        <button class="btn-chip btn-del-item" data-id="${it.id}" style="color:var(--err);">Borrar</button>
      </div>
    </div>
  `).join("");

  listEl.querySelectorAll(".btn-edit-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const it = state.items.find((x) => x.id === btn.dataset.id);
      if (!it) return;
      document.getElementById("adm-edit-id").value = it.id;
      document.getElementById("adm-form-heading").textContent = "Editando Elemento";
      document.getElementById("adm-cat").value = it.category;
      document.getElementById("adm-title").value = it.title;
      document.getElementById("adm-code").value = it.code;
      document.getElementById("adm-url").value = it.url;
      document.getElementById("adm-img").value = it.imgUrl || "";
      document.getElementById("adm-banner").value = it.banner || "";
      document.getElementById("adm-featured").checked = Boolean(it.featured);
      document.getElementById("btn-cancel-edit").classList.remove("hidden");
    });
  });

  listEl.querySelectorAll(".btn-del-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.items = state.items.filter((x) => x.id !== btn.dataset.id);
      guardarEstado(state);
      renderizarListaAdminItems();
      renderizarTodo();
    });
  });
}

document.getElementById("btn-save-poll").addEventListener("click", () => {
  const q = document.getElementById("adm-poll-question").value.trim();
  const lineas = document.getElementById("adm-poll-options").value.split("\n").map((s) => s.trim()).filter(Boolean);
  const msg = document.getElementById("adm-poll-msg");
  if (!q || lineas.length < 2) {
    msg.className = "feedback err";
    msg.textContent = "Escribe la pregunta y al menos 2 opciones (una por línea).";
    return;
  }
  state.polls.unshift({
    id: "poll-" + Date.now(),
    question: q,
    options: lineas.map((txt, i) => ({ id: "opt-" + i + "-" + Math.random().toString(36).slice(2, 5), text: txt, votes: 0 })),
    votedBy: []
  });
  guardarEstado(state);
  document.getElementById("adm-poll-question").value = "";
  document.getElementById("adm-poll-options").value = "";
  msg.className = "feedback ok";
  msg.textContent = "Encuesta publicada.";
  renderizarAdminPolls();
  renderizarVotaciones();
});

function renderizarAdminPolls() {
  const el = document.getElementById("adm-polls-list");
  if (!el) return;
  if (!state.polls.length) {
    el.innerHTML = `<div class="muted small">Sin encuestas creadas.</div>`;
    return;
  }
  el.innerHTML = state.polls.map((p) => {
    const resumen = p.options.map((o) => `${escaparHtml(o.text)}: ${Number(o.votes) || 0}`).join(" • ");
    return `
      <div class="feed-card">
        <div>
          <strong>${escaparHtml(p.question)}</strong>
          <div class="item-meta">${resumen}</div>
        </div>
        <button class="btn-chip btn-del-poll" data-id="${p.id}" style="color:var(--err);">Borrar</button>
      </div>
    `;
  }).join("");

  el.querySelectorAll(".btn-del-poll").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.polls = state.polls.filter((x) => x.id !== btn.dataset.id);
      guardarEstado(state);
      renderizarAdminPolls();
      renderizarVotaciones();
    });
  });
}

function renderizarRegistrosAdmin() {
  const reqEl = document.getElementById("adm-requests-list");
  if (!state.requests.length) {
    reqEl.innerHTML = `<div class="muted small">Sin peticiones registradas.</div>`;
  } else {
    reqEl.innerHTML = state.requests.map((r) => `
      <div class="feed-card column-card">
        <div>
          <strong>[${escaparHtml(r.channel)}] ${escaparHtml(r.title)}</strong>
          ${r.detail ? `<div class="item-meta">${escaparHtml(r.detail)}</div>` : ""}
          <div class="item-meta">Alias: ${escaparHtml(r.alias)} • ${escaparHtml(formatearHora(r.time))}</div>
          <input type="text" class="inp-reply-text" data-id="${r.id}" value="${escaparHtml(r.adminReply || "")}" placeholder="Escribe tu respuesta como administrador..." style="margin-top:8px; margin-bottom:6px;" />
          <button type="button" class="btn-chip btn-save-reply" data-id="${r.id}">💬 Guardar Respuesta</button>
        </div>
      </div>
    `).join("");

    reqEl.querySelectorAll(".btn-save-reply").forEach((btn) => {
      btn.addEventListener("click", () => {
        const inputEl = reqEl.querySelector(`.inp-reply-text[data-id="${btn.dataset.id}"]`);
        const reqObj = state.requests.find((x) => x.id === btn.dataset.id);
        if (reqObj && inputEl) {
          reqObj.adminReply = inputEl.value.trim();
          guardarEstado(state);
          renderizarFeedCanal();
          btn.textContent = "✓ Guardado";
          setTimeout(() => { btn.textContent = "💬 Guardar Respuesta"; }, 1200);
        }
      });
    });
  }

  const visEl = document.getElementById("adm-visits-list");
  visEl.innerHTML = !state.visits.length
    ? `<div class="muted small">Sin accesos registrados.</div>`
    : state.visits.map((v) => `<div class="feed-card"><div><strong>${escaparHtml(v.alias)}</strong><div class="item-meta">${escaparHtml(formatearHora(v.time))}</div></div></div>`).join("");
}

document.getElementById("btn-clear-reqs").addEventListener("click", () => {
  state.requests = [];
  guardarEstado(state);
  renderizarRegistrosAdmin();
  renderizarFeedCanal();
});

document.getElementById("btn-clear-visits").addEventListener("click", () => {
  state.visits = [];
  guardarEstado(state);
  renderizarRegistrosAdmin();
});

document.getElementById("btn-update-access-key").addEventListener("click", async () => {
  const nuevaClave = document.getElementById("adm-new-access-key").value.trim();
  const msgEl = document.getElementById("adm-access-key-msg");
  if (nuevaClave.length < 4) {
    msgEl.className = "feedback err";
    msgEl.textContent = "La clave de acceso debe tener al menos 4 caracteres.";
    return;
  }
  state.accessKeyHash = await sha256Hex(nuevaClave);
  guardarEstado(state);
  document.getElementById("adm-new-access-key").value = "";
  msgEl.className = "feedback ok";
  msgEl.textContent = "Clave de acceso universal actualizada.";
  sonar(659, 1046, "triangle", 0.2, 0.1);
});

document.getElementById("btn-update-pin").addEventListener("click", async () => {
  const nuevoPin = document.getElementById("adm-new-pin").value.trim();
  const pinMsg = document.getElementById("adm-pin-msg");
  if (nuevoPin.length < 4) {
    pinMsg.className = "feedback err";
    pinMsg.textContent = "El nuevo PIN debe tener al menos 4 caracteres.";
    return;
  }
  state.pinHash = await sha256Hex(nuevoPin);
  guardarEstado(state);
  document.getElementById("adm-new-pin").value = "";
  pinMsg.className = "feedback ok";
  pinMsg.textContent = "PIN actualizado con éxito.";
  sonar(659, 1046, "triangle", 0.2, 0.1);
});

document.getElementById("btn-export-backup").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "nexus-hub-respaldo.json";
  a.click();
  URL.revokeObjectURL(url);
});

function renderizarPanelAdmin() {
  renderizarListaAdminItems();
  renderizarAdminPolls();
  renderizarRegistrosAdmin();
}

function renderizarTodo() {
  renderizarCartelera();
  renderizarListaBoveda();
  renderizarFeedCanal();
  renderizarVotaciones();
}

asegurarClaveUniversalInicial().then(async () => {
  if (state.currentAlias) {
    inpAlias.value = state.currentAlias;
  }
  if (state.currentAlias && state.unlockedSession) {
    userBadge.textContent = "VISITANTE: " + state.currentAlias.toUpperCase();
    gateScreen.classList.add("hidden");
    hubMain.classList.remove("hidden");
  }
  renderizarTodo();
  await sincronizarDesdeNube();
  setInterval(sincronizarDesdeNube, 15000);
});