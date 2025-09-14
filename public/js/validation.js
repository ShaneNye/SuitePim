// public/js/validation.js

// --- Validation field map ---
const validationFields = [
  { name: "Include Children", internalid: "includechildren", fieldType: "checkbox", defaultValue: "true" },
  { name: "Use Bins", internalid: "usebins", fieldType: "checkbox", defaultValue: "true" },
  { name: "UPC Code", internalid: "upccode", fieldType: "free-form text", defaultValue: "internalid" },
  { name: "Drop Ship Item", internalid: "isdropshipitem", fieldType: "checkbox", defaultValue: "true" },
  { name: "Web SKU", internalid: "custitemwoo_commerce_sku", fieldType: "free-form text", defaultValue: "internalid" },
  { name: "WMS MIX LOTS IN BINS", internalid: "custitem_wmsse_mix_lot", fieldType: "checkbox", defaultValue: "true" },
  { name: "WMS MIX ITEMS IN BINS", internalid: "custitem_wmsse_mix_item", fieldType: "checkbox", defaultValue: "true" },
  { name: "USE TALLY SCAN", internalid: "custitem_wms_usetallyscan", fieldType: "checkbox", defaultValue: "true" }
];

// --- Suitelet feeds ---
const VALIDATION_FEEDS = {
  sandbox: "https://7972741-sb1.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=4063&deploy=1&compid=7972741_SB1&ns-at=AAEJ7tMQ_MeqOHAMqQr_VxvEHRx5tpG9A7OFoZTvlCBduLahtfk",
  production: "https://7972741.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=4353&deploy=1&compid=7972741&ns-at=AAEJ7tMQPDWBr7BlnFc_GDVmc2ClMgQ_mNcJiARsj6MM2yp17J4"
};

function currentEnvironment() {
  return (localStorage.getItem("environment") || "Sandbox").toLowerCase();
}

let tableData = [];

// --- Page Load ---
window.addEventListener("DOMContentLoaded", async () => {
  const container = document.getElementById("table-data");

  try {
    const url = VALIDATION_FEEDS[currentEnvironment()] || VALIDATION_FEEDS.sandbox;
    const res = await fetch(url);
    const data = await res.json();
    tableData = data;

    if (!Array.isArray(data) || data.length === 0) {
      container.innerHTML = "<p>No validation data available.</p>";
      return;
    }

    // --- Controls (Push Button + Progress Container) ---
    const controls = document.createElement("div");
    controls.style.marginBottom = "1rem";
    controls.style.textAlign = "left";

    const pushBtn = document.createElement("button");
    pushBtn.textContent = "Push Missing Data";
    pushBtn.className = "push-btn";
    pushBtn.addEventListener("click", pushMissingData);

    const progressContainer = document.createElement("div");
    progressContainer.id = "push-progress-container";
    progressContainer.style.marginTop = "0.5rem";

    controls.appendChild(pushBtn);
    controls.appendChild(progressContainer);
    container.appendChild(controls);

    // --- Build Table ---
    const table = document.createElement("table");
    table.className = "csv-table";

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    ["Name", "Internal ID", ...validationFields.map((f) => f.name)].forEach((field) => {
      const th = document.createElement("th");
      th.textContent = field;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    data.forEach((row) => {
      const tr = document.createElement("tr");

      const tdName = document.createElement("td");
      tdName.textContent = row.Name || "";
      tr.appendChild(tdName);

      const internalId = row.internalid || row["Internal ID"] || row["id"] || "";
      const tdId = document.createElement("td");
      tdId.textContent = internalId;
      tr.appendChild(tdId);

      validationFields.forEach((field) => {
        const td = document.createElement("td");
        const val = row[field.name];
        const isTick =
          val === true || val === "T" || val === "true" || (val !== null && val !== "");
        td.textContent = isTick ? "✓" : "✗";
        td.style.color = isTick ? "green" : "red";
        td.style.fontWeight = "bold";
        td.style.textAlign = "center";
        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    container.appendChild(table);
  } catch (err) {
    console.error("Validation fetch error:", err);
    container.innerHTML = "<p>Error loading validation data.</p>";
  }
});

// --- Push Missing Data with batching ---
async function pushMissingData() {
  const rowsToPush = [];

  tableData.forEach((row) => {
    const internalId = row.internalid || row["Internal ID"] || row["id"];
    if (!internalId) return;
    const rowPayload = { internalid: internalId, fields: {} };

    validationFields.forEach((field) => {
      const val = row[field.name];
      const isValid = val === true || val === "T" || val === "true" || (val !== null && val !== "");
      if (!isValid) {
        if (field.fieldType.toLowerCase() === "checkbox") {
          rowPayload.fields[field.internalid] = true; // real boolean
        } else if (field.defaultValue === "internalid") {
          rowPayload.fields[field.internalid] = internalId;
        } else {
          rowPayload.fields[field.internalid] = field.defaultValue;
        }
      }
    });

    if (Object.keys(rowPayload.fields).length > 0) rowsToPush.push(rowPayload);
  });

  if (rowsToPush.length === 0) {
    alert("No missing fields to push 🎉");
    return;
  }

  const progressContainer = document.getElementById("push-progress-container");
  if (progressContainer) {
    progressContainer.innerHTML = `<p>Queueing push of ${rowsToPush.length} rows...</p>`;
  }

  // --- Batch sending ---
  const batchSize = 100;
  let firstJobId;

  try {
    for (let i = 0; i < rowsToPush.length; i += batchSize) {
      const batch = rowsToPush.slice(i, i + batchSize);

      const response = await fetch("/push-validation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: batch }),
      });

      const data = await response.json();
      if (!data.success) {
        if (progressContainer) {
          progressContainer.innerHTML = `<p style="color:red;">❌ Failed to queue batch: ${data.message}</p>`;
        }
        window.updateFooterProgress(0, batch.length, "error", 0, 0);
        return;
      }

      const { jobId, queuePos, queueTotal } = data;

      if (!firstJobId && jobId) {
        firstJobId = jobId;
        localStorage.setItem("lastJobId", jobId);

        if (progressContainer) {
          progressContainer.innerHTML = `<p>🚀 Validation job queued (Job ${queuePos} of ${queueTotal})</p>`;
        }
        window.updateFooterProgress(0, rowsToPush.length, "pending", queuePos, queueTotal);

        pollJobStatus(jobId, rowsToPush.length, progressContainer);
      }
    }
  } catch (err) {
    console.error("Error starting validation push:", err);
    if (progressContainer) {
      progressContainer.innerHTML = `<p style="color:red;">❌ Push failed: ${err.message}</p>`;
    }
    window.updateFooterProgress(0, rowsToPush.length, "error", 0, 0);
  }
}

function pollJobStatus(jobId, totalRows, progressContainer) {
  const interval = setInterval(async () => {
    try {
      const statusRes = await fetch(`/push-status/${jobId}`);
      const statusData = await statusRes.json();

      if (!statusData || !statusData.status) {
        if (progressContainer) {
          progressContainer.innerHTML += `<p style="color:red;">❌ Lost job status</p>`;
        }
        window.updateFooterProgress(0, totalRows, "error", 0, 0);
        clearInterval(interval);
        return;
      }

      const { status, processed, total, results, queuePos, queueTotal } = statusData;

      if (progressContainer) {
        progressContainer.innerHTML = `<p>Status: ${status} — ${processed}/${total} rows processed</p>`;
      }
      window.updateFooterProgress(processed, total, status, queuePos, queueTotal);

      if (status === "completed" || status === "error") {
        clearInterval(interval);

        const successCount = results.filter(
          (r) => r.status === "Success" || r.status === 200 || r.status === 204
        ).length;
        const failCount = total - successCount;

        if (progressContainer) {
          progressContainer.innerHTML += `<p>✅ Push finished. ${successCount} of ${total} rows updated successfully.</p>`;
          if (failCount > 0) {
            progressContainer.innerHTML += `<p style="color:red;">❌ ${failCount} row(s) failed to update.</p>`;
          }
        }

        window.updateFooterProgress(processed, total, status, queuePos, queueTotal);
        localStorage.removeItem("lastJobId");
      }
    } catch (err) {
      console.error("Polling error:", err);
      if (progressContainer) {
        progressContainer.innerHTML += `<p style="color:red;">❌ Error polling job status</p>`;
      }
      window.updateFooterProgress(0, totalRows, "error", 0, 0);
      clearInterval(interval);
    }
  }, 3000);
}
