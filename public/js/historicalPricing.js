// public/js/historicalPricing.js
const API_BASE = "http://localhost:3000";

async function loadHistoricalPricing() {
  const container = document.createElement("div");
  container.className = "pricing-container";
  document.body.insertBefore(container, document.getElementById("footer-container"));

  // --- Input controls ---
  const inputWrap = document.createElement("div");
  inputWrap.className = "input-wrap";
  inputWrap.innerHTML = `
    <label for="itemId"><strong>Enter Item Internal ID:</strong></label>
    <input id="itemId" type="text" placeholder="e.g. 2660" />
    <button id="fetchBtn">Fetch History</button>
  `;
  container.appendChild(inputWrap);

  const resultWrap = document.createElement("div");
  resultWrap.id = "resultWrap";
  resultWrap.innerHTML = `<p>Enter an Item ID and click <strong>Fetch History</strong>.</p>`;
  container.appendChild(resultWrap);

  document.getElementById("fetchBtn").addEventListener("click", async () => {
    const id = document.getElementById("itemId").value.trim();
    if (!id) return alert("Please enter an Internal ID.");

    resultWrap.innerHTML = `<p>Loading...</p>`;
    try {
      const res = await fetch(`${API_BASE}/api/item/${id}/history`);
      const data = await res.json();

      if (!data.success) {
        resultWrap.innerHTML = `<p style="color:red;">❌ ${data.error || "Failed to load data"}</p>`;
        return;
      }

      renderPricingHistory(resultWrap, id, data);
    } catch (err) {
      resultWrap.innerHTML = `<p style="color:red;">❌ Error fetching data: ${err.message}</p>`;
    }
  });
}

// --- UI Rendering Function ---
function renderPricingHistory(resultWrap, id, data) {
  resultWrap.innerHTML = `
    <h2>Item ID: ${id}</h2>
    <p><strong>Current Purchase Price:</strong> £${data.purchasePrice ?? "N/A"}</p>
    <p><strong>Total Records:</strong> ${data.totalRecords}</p>
    <hr />
  `;

  if (!Array.isArray(data.history) || data.history.length === 0) {
    resultWrap.innerHTML += `<p>No historical pricing records found.</p>`;
    return;
  }

  // --- Build Pricing Table ---
  const table = document.createElement("table");
  table.className = "history-table";
  table.innerHTML = `
    <thead>
      <tr>
        <th>Date</th>
        <th>User</th>
        <th>Field</th>
        <th>Price Level</th>
        <th>Currency</th>
        <th>Price (£)</th>
        <th>Discount %</th>
        <th>Min Qty</th>
      </tr>
    </thead>
    <tbody>
      ${data.history
        .map(
          (row) => `
          <tr>
            <td>${row.Date}</td>
            <td>${row.User}</td>
            <td>${row.Field}</td>
            <td>${row.PriceLevel}</td>
            <td>${row.Currency}</td>
            <td>${row.Price}</td>
            <td>${row.Discount}</td>
            <td>${row.MinQty}</td>
          </tr>`
        )
        .join("")}
    </tbody>
  `;
  resultWrap.appendChild(table);

  // --- Optional Debug Section ---
  const debugToggle = document.createElement("button");
  debugToggle.textContent = "Show Debug Info";
  debugToggle.className = "debug-toggle";

  const debugDiv = document.createElement("pre");
  debugDiv.className = "debug-info hidden";
  debugDiv.textContent = JSON.stringify(data.debug, null, 2);

  debugToggle.addEventListener("click", () => {
    const isHidden = debugDiv.classList.contains("hidden");
    debugDiv.classList.toggle("hidden", !isHidden);
    debugToggle.textContent = isHidden ? "Hide Debug Info" : "Show Debug Info";
  });

  resultWrap.appendChild(debugToggle);
  resultWrap.appendChild(debugDiv);
}

// --- Basic Styling ---
const style = document.createElement("style");
style.textContent = `
  .pricing-container {
    padding: 1rem 2rem;
    max-width: 1100px;
    margin: auto;
  }
  .input-wrap {
    margin-bottom: 1.5rem;
  }
  #itemId {
    width: 120px;
    margin-left: 0.5rem;
    margin-right: 0.5rem;
    padding: 0.3rem 0.5rem;
  }
  #fetchBtn {
    padding: 0.4rem 0.8rem;
    background-color: #FFD700;;
    color: black;
    border: none;
    border-radius: 5px;
    cursor: pointer;
  }
  #fetchBtn:hover {
    background-color: #00695C;
  }
  .history-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 1rem;
    font-size: 0.9rem;
  }
  .history-table th, .history-table td {
    border: 1px solid #ddd;
    padding: 6px 10px;
    text-align: left;
  }
  .history-table th {
    background-color: #f2f2f2;
  }
  .debug-toggle {
    margin-top: 1rem;
    padding: 0.4rem 0.8rem;
    background-color: #ccc;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }
  .debug-info {
    background-color: #f5f5f5;
    border: 1px solid #ccc;
    padding: 1rem;
    margin-top: 0.5rem;
    font-size: 0.8rem;
    overflow-x: auto;
  }
  .hidden { display: none; }
`;
document.head.appendChild(style);

window.addEventListener("DOMContentLoaded", loadHistoricalPricing);
