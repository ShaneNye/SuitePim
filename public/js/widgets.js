// public/js/widgets.js

const feeds = {
  validation: {
    sandbox: "https://7972741-sb1.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=4063&deploy=1&compid=7972741_SB1&ns-at=AAEJ7tMQ_MeqOHAMqQr_VxvEHRx5tpG9A7OFoZTvlCBduLahtfk",
    prod: "https://7972741.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=4353&deploy=1&compid=7972741&ns-at=AAEJ7tMQPDWBr7BlnFc_GDVmc2ClMgQ_mNcJiARsj6MM2yp17J4"
  },
  productsOnline: {
    sandbox: "https://7972741-sb1.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=4070&deploy=1&compid=7972741_SB1&ns-at=AAEJ7tMQ36KHWv402slQtrHVQ0QIFZOqj2KRxW39ZEthF8eqhic",
    prod: "https://7972741.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=4365&deploy=1&compid=7972741&ns-at=AAEJ7tMQX3Lm8Lt3rpeFR1ezfurShY30Is8kgSGklUki_rKqMrQ"
  }
};

function currentEnv() {
  return (localStorage.getItem("environment") || "Sandbox").toLowerCase();
}

async function fetchData(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error("❌ Widget fetch failed:", err);
    return [];
  }
}

function renderMultiRadial(container, metrics) {
  const size = 260;
  const center = size / 2;
  const svgParts = [];
  const labels = [];

  // dynamic spacing
  const ringWidth = 18;
  const ringGap = 8;
  const maxRadius = 100;
  const minRadius = 25;

  metrics.forEach((m, idx) => {
    const radius = maxRadius - idx * (ringWidth + ringGap);
    if (radius < minRadius) return;

    const circumference = 2 * Math.PI * radius;
    const percent = m.total > 0 ? (m.value / m.total) * 100 : 0;
    const offset = circumference - (percent / 100) * circumference;

    const arcId = `arc-${idx}-${Date.now()}`;

    svgParts.push(`
      <!-- background track -->
      <circle
        cx="${center}" cy="${center}" r="${radius}"
        stroke="#f0f0f0" stroke-width="${ringWidth}"
        fill="none"
      />
      <!-- progress arc (animated) -->
      <circle
        id="${arcId}"
        cx="${center}" cy="${center}" r="${radius}"
        stroke="${m.color}" stroke-width="${ringWidth}"
        fill="none"
        stroke-linecap="round"
        stroke-dasharray="${circumference}"
        stroke-dashoffset="${circumference}"
        transform="rotate(-90 ${center} ${center})"
      />
      <animate
        xlink:href="#${arcId}"
        attributeName="stroke-dashoffset"
        from="${circumference}"
        to="${offset}"
        dur="1.2s"
        fill="freeze"
        begin="0.2s"
      />
    `);

    labels.push(`
      <div class="radial-label">
        <span class="dot" style="background:${m.color}"></span>
        <span>${m.label}: <strong>${percent.toFixed(1)}%</strong> (${m.value}/${m.total})</span>
      </div>
    `);
  });

  container.innerHTML = `
    <div class="multi-radial-widget">
      <h3 class="radial-title">Product Health</h3>
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        ${svgParts.join("\n")}
      </svg>
      <div class="radial-legend">
        ${labels.join("")}
      </div>
    </div>
  `;
}

export async function renderWidgets() {
  const container = document.getElementById("widgets-container");
  if (!container) return;

  container.innerHTML = `
    <div class="radial-loading">
      <div class="spinner"></div>
      <p>Loading Product Health…</p>
    </div>
  `;

  const env = currentEnv();
  const validationUrl = env === "production" ? feeds.validation.prod : feeds.validation.sandbox;
  const onlineUrl     = env === "production" ? feeds.productsOnline.prod : feeds.productsOnline.sandbox;

  const [validationData, onlineData] = await Promise.all([
    fetchData(validationUrl),
    fetchData(onlineUrl)
  ]);

  container.innerHTML = "";

  const totalProducts = onlineData.length;

  // Deduplicate validation rows by Internal ID
  const uniqueMissing = new Set(validationData.map(r => r["Internal ID"] || r.internalid));
  const missingCount  = uniqueMissing.size;

  const onlineCount   = onlineData.filter(r => r["Woo ID"]).length;

  console.log("👉 Validation unique Internal IDs (missing fields):", missingCount);
  console.log("👉 Online dataset length (total products):", totalProducts);
  console.log("👉 Online count (Woo ID present):", onlineCount);

  let metrics = [
    { label: "Products Missing Fields", value: missingCount, total: totalProducts, color: "#e74c3c" },
    { label: "Products Online", value: onlineCount, total: totalProducts, color: "#2ecc71" }
  ];

  // Remove zero values
  metrics = metrics.filter(m => m.value > 0);

  // Sort largest % → smallest, so outer ring is biggest %
  metrics.sort((a, b) => (b.value / b.total) - (a.value / a.total));

  renderMultiRadial(container, metrics);
}

window.addEventListener("DOMContentLoaded", renderWidgets);

// --- Styles ---
const style = document.createElement("style");
style.textContent = `
  .multi-radial-widget {
    background: #fff;
    border-radius: 12px;
    padding: 1.5rem 2rem;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    display: flex;
    flex-direction: column;
    align-items: center;
    margin: 1rem auto;
    max-width: 380px;
  }
  .radial-title {
    margin-bottom: 1rem;
    color: #333;
  }
  .multi-radial-widget svg {
    margin-bottom: 1rem;
  }
  .radial-legend {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 0.9rem;
    text-align: left;
    width: 100%;
  }
  .radial-label {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .radial-label .dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    display: inline-block;
  }
  .radial-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 2rem;
  }
  .spinner {
    border: 4px solid #f3f3f3;
    border-top: 4px solid #0081AB;
    border-radius: 50%;
    width: 30px;
    height: 30px;
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;
document.head.appendChild(style);
