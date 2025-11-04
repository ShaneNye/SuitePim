// /public/js/historicalPricing.js
console.log("✅ historicalPricing.js loaded");

// Open modal to name file
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

    // Only include key fields
    const reduced = data.map((row) => ({
      "Internal ID": row["Internal ID"],
      "Name": row["Name"],
      "Purchase Price": row["Purchase Price"],
      "Base Price": row["Base Price"],
    }));

    try {
      const res = await fetch("/api/savePromotion", {
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
// Ensure modal displays correctly above footer
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
    z-index: 9999; /* bring above footer & table */
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

  @keyframes modalPop {
    from { transform: scale(0.95); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }
`;
document.head.appendChild(style);
