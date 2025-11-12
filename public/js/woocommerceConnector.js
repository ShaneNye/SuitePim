// ===========================
// WooCommerce Connector
// ===========================

const jsonUrl =
  "https://7972741-sb1.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=4070&deploy=1&compid=7972741_SB1&ns-at=AAEJ7tMQ36KHWv402slQtrHVQ0QIFZOqj2KRxW39ZEthF8eqhic";

let fullData = [];
let filteredData = [];

// --- Helpers ---
const hasValue = (v) => v != null && v !== "" && v !== "null";
const hasMissingFields = (row) => {
  const ignore = ["Internal ID", "Name", "parent internal  id", "Is Parent", "Connector ID"];
  return Object.keys(row)
    .filter((k) => !ignore.includes(k))
    .some((k) => !hasValue(row[k]));
};

// --- Load & Init ---
window.addEventListener("DOMContentLoaded", async () => {
  const container = document.getElementById("table-data");
  const loader = document.createElement("div");
  loader.className = "loading-container";
  loader.innerHTML = `<div class="spinner"></div><p>Loading data, please wait...</p>`;
  container.appendChild(loader);

  try {
    const res = await fetch(jsonUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    fullData = await res.json();

    filteredData = fullData.filter((r) => r["Is Parent"]);
    container.innerHTML = "";

    // --- Render Filter Panel ---
    renderFilterPanel(container);

    // --- Push Button (below filter, above table) ---
    const actionContainer = document.createElement("div");
    actionContainer.className = "woo-action-container";

    const pushBtn = document.createElement("button");
    pushBtn.textContent = "Push";
    pushBtn.className = "woo-push-btn";
    actionContainer.appendChild(pushBtn);
    container.appendChild(actionContainer);

    // ✅ now safely add the click logic *after* pushBtn exists
    pushBtn.addEventListener("click", async () => {
      const checkedRows = document.querySelectorAll(".row-select:checked");
      if (checkedRows.length === 0) {
        alert("Please select at least one item to push.");
        return;
      }

      // Collect data from selected parent + child rows
      const rowsToPush = [];

      checkedRows.forEach((cb) => {
        const row = cb.closest("tr");
        if (!row) return;

        // find nearest table header row
        const table = row.closest("table");
        const headers = [...table.querySelectorAll("th")].map((th) =>
          th.textContent.trim()
        );

        const cells = [...row.querySelectorAll("td")];
        const rowData = {};

        // Map header -> cell text
        headers.forEach((header, i) => {
          const cell = cells[i];
          if (!cell) return;
          const val = cell.textContent.trim();
          if (header) rowData[header] = val;
        });

        // parent/child detection
        const parentId = row.dataset.parentId;
        if (parentId) rowData["parent internal  id"] = parentId;

        rowsToPush.push(rowData);
      });

      if (rowsToPush.length === 0) {
        alert("No valid rows found.");
        return;
      }

      console.log("🟢 Pushing rows:", rowsToPush);

      // Show temporary loader
      pushBtn.disabled = true;
      pushBtn.textContent = "Pushing...";

      try {
        const res = await fetch("/api/woo/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rows: rowsToPush,
            environment: "Sandbox", // change to Production as needed
          }),
        });

        const data = await res.json();

        if (!data.success) {
          alert(`❌ Push failed: ${data.error || data.message}`);
        } else {
          console.log("✅ WooCommerce Push Results:", data);
          alert(`✅ Push completed (${data.results.length} items processed)`);
        }
      } catch (err) {
        console.error("❌ Push error:", err);
        alert("An error occurred while pushing products.");
      } finally {
        pushBtn.disabled = false;
        pushBtn.textContent = "Push";
      }
    });

    // --- Limit to 25 rows on initial load ---
    const initialSubset = filteredData.slice(0, 25);
    buildTable(initialSubset, container);
  } catch (err) {
    container.innerHTML = `<p style="color:red;">❌ Failed to load: ${err.message}</p>`;
  }
});

// --- Filter Logic ---
function filterData(filters) {
  if (!filters.length) return fullData.filter((r) => r["Is Parent"]);
  return fullData.filter((item) => {
    if (!item["Is Parent"]) return false;
    return filters.every(({ field, value }) =>
      (item[field] || "").toString().toLowerCase().includes(value.toLowerCase())
    );
  });
}

function renderFilterPanel(container) {
  const panelContainer = document.createElement("div");
  panelContainer.className = "filter-panel-container";

  const header = document.createElement("div");
  header.className = "filter-panel-header";
  header.innerHTML = `Filters <span>&#9660;</span>`;
  panelContainer.appendChild(header);

  const body = document.createElement("div");
  body.className = "filter-panel";
  body.id = "filter-panel";

  const table = document.createElement("table");
  table.id = "filter-table";
  table.innerHTML = `
    <thead><tr><th>Field</th><th>Value</th><th></th></tr></thead>
    <tbody id="filter-tbody"></tbody>
  `;
  body.appendChild(table);

  const addBtn = document.createElement("button");
  addBtn.textContent = "Add Filter";
  addBtn.className = "add-filter-btn";
  addBtn.onclick = () => addFilterRow();

  const applyBtn = document.createElement("button");
  applyBtn.textContent = "Apply";
  applyBtn.className = "apply-filter-btn";
  applyBtn.onclick = () => {
    const filters = [];
    document.querySelectorAll("#filter-tbody tr").forEach((tr) => {
      const field = tr.querySelector(".filter-field")?.value;
      const value = tr.querySelector(".filter-value")?.value;
      if (field && value) filters.push({ field, value });
    });
    const results = filterData(filters);
    document.querySelector("#main-table")?.remove();
    buildTable(results, container);
  };

  body.append(addBtn, applyBtn);
  panelContainer.appendChild(body);
  container.appendChild(panelContainer);

  header.addEventListener("click", () => {
    body.classList.toggle("collapsed");
    header.classList.toggle("collapsed");
  });

  addFilterRow();
}

function addFilterRow() {
  const tbody = document.getElementById("filter-tbody");
  const row = document.createElement("tr");

  const fieldTd = document.createElement("td");
  const valueTd = document.createElement("td");
  const removeTd = document.createElement("td");

  const select = document.createElement("select");
  select.className = "filter-field theme-select";
  const fields = ["Name", "Display Name", "Preferred Supplier", "Class", "Category", "Colour Filter"];
  select.innerHTML =
    `<option value="">-- choose field --</option>` +
    fields.map((f) => `<option value="${f}">${f}</option>`).join("");
  fieldTd.appendChild(select);

  const input = document.createElement("input");
  input.className = "filter-value";
  input.type = "text";
  valueTd.appendChild(input);

  const remove = document.createElement("button");
  remove.textContent = "×";
  remove.className = "remove-filter-btn";
  remove.onclick = () => row.remove();
  removeTd.appendChild(remove);

  row.append(fieldTd, valueTd, removeTd);
  tbody.appendChild(row);
}

// --- Build Table ---
function buildTable(parents, container) {
  const table = document.createElement("table");
  table.className = "csv-table";
  table.id = "main-table";

  const thead = document.createElement("thead");
  thead.innerHTML = `
    <tr>
      <th><input type="checkbox" class="select-all"></th>
      <th>Internal ID</th>
      <th>Name</th>
      <th>Display Name</th>
      <th>Preferred Supplier</th>
      <th>Connector ID</th>
      <th>Has Values</th>
    </tr>`;
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  // --- Loop through each parent row ---
  parents.forEach((parent) => {
    const tr = document.createElement("tr");
    tr.className = "parent-row";
    tr.dataset.parentId = parent["Internal ID"];

    tr.innerHTML = `
      <td><input type="checkbox" class="row-select parent-checkbox"></td>
      <td>${parent["Internal ID"]}</td>
      <td>${parent["Name"] || ""}</td>
      <td>${parent["Display Name"] || ""}</td>
      <td>${parent["Preferred Supplier"] || ""}</td>
      <td>${parent["Connector ID"] || ""}</td>
      <td class="has-value">${hasMissingFields(parent) ? "❌" : "✔️"}</td>
    `;

    const children = fullData.filter(
      (c) => c["parent internal  id"] === parent["Internal ID"]
    );

    if (children.length > 0) {
      const childRow = document.createElement("tr");
      childRow.className = "child-row";
      const childTd = document.createElement("td");
      childTd.colSpan = 7;

      const childTable = document.createElement("table");
      childTable.className = "child-table";

      // --- Collect matrix fields dynamically (only those with values) ---
      const matrixFields = new Set();
      children.forEach((c) => {
        Object.keys(c).forEach((key) => {
          if (
            key.startsWith("Matrix :") &&
            c[key] &&
            String(c[key]).trim() !== ""
          ) {
            matrixFields.add(key);
          }
        });
      });
      const matrixColumns = Array.from(matrixFields);

      // --- Build child header dynamically ---
      const head = document.createElement("tr");
      head.innerHTML = `
        <th><input type="checkbox" class="select-all-child"></th>
        <th>Internal ID</th>
        <th>Name</th>
        <th>Enabled for WooCommerce</th>
        <th>Connector ID</th>
        ${matrixColumns
          .map((col) => `<th>${col.replace("Matrix :", "").trim()}</th>`)
          .join("")}
        <th>Has Values</th>
      `;
      childTable.appendChild(head);

      // --- Build child rows ---
      children.forEach((c) => {
        const cr = document.createElement("tr");
        cr.classList.add("child-item");
        cr.dataset.parentId = parent["Internal ID"];

        let matrixCells = matrixColumns
          .map((col) => `<td>${c[col] || ""}</td>`)
          .join("");

        cr.innerHTML = `
          <td><input type="checkbox" class="row-select child-checkbox"></td>
          <td>${c["Internal ID"]}</td>
          <td>${c["Name"] || ""}</td>
          <td>${c["Enabled for WooCommerce"] || ""}</td>
          <td>${c["Connector ID"] || ""}</td>
          ${matrixCells}
          <td class="has-value">${hasMissingFields(c) ? "❌" : "✔️"}</td>
        `;
        childTable.appendChild(cr);
      });

      childTd.appendChild(childTable);
      childRow.appendChild(childTd);
      childRow.style.display = "none";
      tbody.append(tr, childRow);

      // --- Toggle expand/collapse ---
      tr.addEventListener("click", (e) => {
        if (e.target.type === "checkbox") return;
        const open = childRow.style.display === "table-row";
        childRow.style.display = open ? "none" : "table-row";
        tr.classList.toggle("expanded", !open);
      });
    } else {
      tbody.appendChild(tr);
    }
  });

  table.appendChild(tbody);
  container.appendChild(table);

  // =====================================================
  // 🧩 Checkbox hierarchy logic
  // =====================================================

  const masterCheckbox = table.querySelector(".select-all");

  // --- Master checkbox toggles all ---
  masterCheckbox.addEventListener("change", (e) => {
    const checked = e.target.checked;
    table.querySelectorAll(".row-select").forEach((cb) => {
      cb.checked = checked;
    });
  });

  // --- Parent checkbox toggles all its children ---
  table.querySelectorAll(".parent-checkbox").forEach((parentCb) => {
    parentCb.addEventListener("change", (e) => {
      const parentId = e.target.closest("tr").dataset.parentId;
      const checked = e.target.checked;

      const childCheckboxes = table.querySelectorAll(
        `.child-checkbox[data-parent-id="${parentId}"]`
      );
      childCheckboxes.forEach((cb) => (cb.checked = checked));
    });
  });

  // --- Assign parentId to each child checkbox for lookup ---
  table.querySelectorAll(".child-checkbox").forEach((cb) => {
    const row = cb.closest("tr");
    if (row && row.dataset.parentId) {
      cb.dataset.parentId = row.dataset.parentId;
    }
  });
}
