// /public/js/historicalPricingDisplay.js
console.log("✅ historicalPricingDisplay.js loaded");

// --- DOM References ---
const titleEl = document.getElementById("page-title");

// Create main container
const container = document.createElement("div");
container.className = "historical-container";
document.body.insertBefore(container, document.getElementById("footer-container"));

// Create header section
const headerBar = document.createElement("div");
headerBar.className = "historical-header";
headerBar.innerHTML = `
  <div class="header-left">
    <label for="pricing-files">📂 Select Snapshot:</label>
    <select id="pricing-files">
      <option value="">-- choose file --</option>
    </select>
  </div>
  <div class="header-right">
    <button id="push-btn" class="btn primary" disabled>📤 Push</button>
  </div>
`;
container.appendChild(headerBar);

// Create data display section
const tableContainer = document.createElement("div");
tableContainer.id = "pricing-table-container";
container.appendChild(tableContainer);

// --- Load pricing file list ---
async function loadFileList() {
  try {
    const res = await fetch("/api/pricing"); // ✅ backend returns [{ name, path }]
    if (!res.ok) throw new Error("Failed to fetch pricing list");
    const files = await res.json();

    const select = document.getElementById("pricing-files");
    select.innerHTML = `<option value="">-- choose file --</option>`;
    files.forEach((f) => {
      const opt = document.createElement("option");
      opt.value = f.name;
      opt.textContent = f.name.replace(/_/g, " ");
      select.appendChild(opt);
    });
  } catch (err) {
    console.error("❌ Failed to load pricing files:", err);
    tableContainer.innerHTML = `<p style="color:red;">Failed to load file list.</p>`;
  }
}

// --- Load file content & render table ---
async function loadFileContent(name) {
  if (!name) return;
  tableContainer.innerHTML = `<p>Loading ${name}…</p>`;
  try {
    const res = await fetch(`/api/pricing/${encodeURIComponent(name)}`);
    if (!res.ok) throw new Error("Failed to load file");
    const data = await res.json();
    renderPricingTable(data, name);
  } catch (err) {
    console.error("❌ Error loading pricing file:", err);
    tableContainer.innerHTML = `<p style="color:red;">Failed to load ${name}</p>`;
  }
}

// --- Render Table ---
function renderPricingTable(data, fileName) {
  if (!Array.isArray(data) || data.length === 0) {
    tableContainer.innerHTML = `<p>No data found in ${fileName}.json</p>`;
    return;
  }

  document.getElementById("push-btn").disabled = false;
  titleEl.textContent = `Historical Pricing — ${fileName.replace(/_/g, " ")}`;

  const table = document.createElement("table");
  table.className = "pricing-table";
  const thead = document.createElement("thead");
  const tbody = document.createElement("tbody");

  const columns = Object.keys(data[0]);

  // Header row
  const headerRow = document.createElement("tr");
  columns.forEach((col) => {
    const th = document.createElement("th");
    th.textContent = col;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  // Data rows
  data.forEach((row) => {
    const tr = document.createElement("tr");
    columns.forEach((col) => {
      const td = document.createElement("td");
      td.textContent = row[col];
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  table.appendChild(thead);
  table.appendChild(tbody);

  tableContainer.innerHTML = "";
  tableContainer.appendChild(table);

  // Store table data globally for Push
  window.currentPricingData = data;
}

// --- Event Listeners ---
document.getElementById("pricing-files").addEventListener("change", (e) => {
  const name = e.target.value;
  if (!name) {
    document.getElementById("push-btn").disabled = true;
    tableContainer.innerHTML = "";
    titleEl.textContent = "Historical Pricing";
    window.currentPricingData = [];
  } else {
    loadFileContent(name);
  }
});

// --- Push to NetSuite ---
document.getElementById("push-btn").addEventListener("click", async () => {
  const rows = window.currentPricingData || [];
  if (!rows.length) {
    alert("❌ No data loaded to push.");
    return;
  }

  // ✅ Get selected file name so backend knows what to delete later
  const select = document.getElementById("pricing-files");
  const fileName = select?.value || "";

  if (!confirm(`Push ${rows.length} records to NetSuite?`)) return;

  try {
    const res = await fetch("/push-pricing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // ✅ Include fileName in the payload
      body: JSON.stringify({ rows, fileName }),
    });

    const json = await res.json();
    if (!res.ok || !json.success) {
      alert("❌ Failed to enqueue push job. See console for details.");
      console.error(json);
      return;
    }

    // ✅ Save jobId for footer progress tracking
    localStorage.setItem("lastJobId", json.jobId);
    if (window.checkFooterJobStatus) window.checkFooterJobStatus();

    alert(
      `✅ Historical Pricing push queued with ${rows.length} record(s).\nJob ID: ${json.jobId}\nQueue Position: ${json.queuePos}/${json.queueTotal}`
    );
  } catch (err) {
    console.error("❌ Push error:", err);
    alert("❌ Failed to start push job — see console for details.");
  }
});


// --- Bootstrap ---
loadFileList();
