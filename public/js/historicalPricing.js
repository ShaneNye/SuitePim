// /public/js/historicalPricing.js
console.log("✅ historicalPricing.js loaded");

// --- OPEN MODAL TO SAVE HISTORICAL PRICING SNAPSHOT ---
export function openHistoricalPricingModal(data) {
  let modal = document.getElementById("historical-pricing-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "historical-pricing-modal";
    modal.className = "modal hidden";
    modal.innerHTML = `
      <div class="modal-content">
        <h3>Save Historical Pricing Snapshot</h3>
        <label>File name:</label>
        <input id="hp-filename" type="text" placeholder="e.g. pricing_november_2025" style="width:100%;margin:8px 0;padding:6px;"/>
        <div class="modal-actions">
          <button id="hp-cancel" class="btn">Cancel</button>
          <button id="hp-save" class="btn primary">Save</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  const input = modal.querySelector("#hp-filename");
  const cancel = modal.querySelector("#hp-cancel");
  const save = modal.querySelector("#hp-save");

  modal.classList.remove("hidden");
  input.focus();

  cancel.onclick = () => modal.classList.add("hidden");

  save.onclick = async () => {
    const fileName = input.value.trim().replace(/\s+/g, "_").toLowerCase();
    if (!fileName) {
      alert("Please enter a file name");
      return;
    }

    modal.classList.add("hidden");

    // ✅ Step 1: Prefer data currently visible in the rendered table
    let visibleData = [];
    const table = document.querySelector("table.csv-table");
    if (table) {
      const rows = Array.from(table.querySelectorAll("tbody tr"));
      const headers = Array.from(
        table.querySelectorAll("thead th")
      ).map((th) => th.textContent.trim());

      rows.forEach((row) => {
        const obj = {};
        const cells = Array.from(row.querySelectorAll("td")).slice(1); // skip selector column
        headers.slice(1).forEach((header, i) => {
          const el = cells[i]?.querySelector("input, select, textarea");
          obj[header] = el ? el.value : cells[i]?.textContent.trim();
        });
        visibleData.push(obj);
      });
    }

    // ✅ Step 2: Fallback to global filteredData if no table found
    if (!visibleData.length && window.filteredData?.length) {
      visibleData = window.filteredData;
    }

    // ✅ Step 3: Reduce to required key fields only
    const reduced = visibleData.map((row) => ({
      "Internal ID": row["Internal ID"],
      "Name": row["Name"],
      "Purchase Price": row["Purchase Price"],
      "Base Price": row["Base Price"],
    }));

    // ✅ Step 4: Send to backend for GitHub commit (into /pricing folder)
    try {
      const res = await fetch("/api/savePricingSnapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName,
          content: JSON.stringify(reduced, null, 2),
        }),
      });

      const json = await res.json();
      if (res.ok) {
        alert(`✅ Historical pricing saved as ${fileName}.json`);
      } else {
        console.error("Save failed:", json);
        alert("❌ Failed to save file: " + (json.error || "Unknown error"));
      }
    } catch (err) {
      console.error("Error saving historical pricing:", err);
      alert("❌ Save error — see console");
    }
  };
}

// --- STYLE INJECTION (blue scheme / #0081AB) ---
const style = document.createElement("style");
style.textContent = `
  #historical-pricing-modal {
    position: fixed;
    top: 0; left: 0;
    width: 100vw; height: 100vh;
    background: rgba(0,0,0,0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
  }

  #historical-pricing-modal.hidden {
    display: none;
  }

  #historical-pricing-modal .modal-content {
    background: #fff;
    padding: 20px;
    border-radius: 8px;
    width: 400px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    animation: modalPop 0.2s ease-out;
  }

  #historical-pricing-modal .modal-actions {
    margin-top: 12px;
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }

  #historical-pricing-modal input[type="text"] {
    font-size: 1rem;
    border: 1px solid #ccc;
    border-radius: 6px;
  }

  .btn {
    padding: 6px 12px;
    border-radius: 6px;
    border: 1px solid #ccc;
    background: #f4f4f4;
    cursor: pointer;
  }

  .btn.primary {
    background: #0081AB;
    color: #fff;
    border: none;
  }

  .btn.primary:hover {
    background: #00739a;
  }

  .btn.primary:disabled {
    background: #c7c7c7;
    cursor: not-allowed;
  }

  @keyframes modalPop {
    from { transform: scale(0.95); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }
`;
document.head.appendChild(style);
