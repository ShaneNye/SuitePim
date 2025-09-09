// ProductData.js
import { fieldMap } from "./fieldMap.js";

const SANDBOXjsonUrl =
  "https://7972741-sb1.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=4058&deploy=2&compid=7972741_SB1&ns-at=AAEJ7tMQ-74HtNHaDkUIVEeh7BJ5FkmE6ELyzq7-HDyCsW7QtU4";

const PRODjsonUrl =
  "https://7972741.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=4349&deploy=1&compid=7972741&ns-at=AAEJ7tMQJry3Xg_bYRGo6Nb9K7z8_2rleWv3_ujrUWhzaxks0Io";

// Pick environment (default Sandbox)
const environment = localStorage.getItem("environment") || "Sandbox";

const jsonUrl =
  environment.toLowerCase() === "production" ? PRODjsonUrl : SANDBOXjsonUrl;

const MAX_ROWS = 500;


// ✅ List of tool-generated columns
const toolColumns = ["Retail Price", "Margin"];

let fullData = [];
let filteredData = [];
let displayedColumns = [];
const listCache = {}; // cache for List/Record feeds

// --- UTILS ---
async function getListOptions(field) {
  if (listCache[field.name]) return listCache[field.name];
  if (!field.jsonFeed) return [];
  try {
    const res = await fetch(field.jsonFeed);
    const data = await res.json();
    listCache[field.name] = data;
    return data;
  } catch (err) {
    console.error("Failed to fetch list options for", field.name, err);
    return [];
  }
}

// --- LOAD DATA ---
async function loadJSONData() {
  const container = document.getElementById("table-data");

  // Spinner (fetch phase)
  const spinnerContainer = document.createElement("div");
  spinnerContainer.classList.add("loading-container");
  const spinnerMsg = document.createElement("p");
  spinnerMsg.textContent = "Loading data, please wait...";
  spinnerContainer.innerHTML = `<div class="spinner"></div>`;
  spinnerContainer.appendChild(spinnerMsg);
  container.appendChild(spinnerContainer);

  try {
    // Fetch JSON
    const response = await fetch(jsonUrl);
    if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);

    fullData = await response.json();

    // Tool columns
    if (typeof window.addRetailPriceTool === "function")
      fullData = window.addRetailPriceTool(fullData);
    if (typeof window.addMarginTool === "function")
      fullData = window.addMarginTool(fullData);

    filteredData = [...fullData];

    const columns = Object.keys(fullData[0] || {});
    displayedColumns = [
      ...columns.slice(0, 7),
      ...toolColumns.filter((tc) => !columns.slice(0, 7).includes(tc)),
    ];

    // Build panels (hidden until table is ready)
    const panelsParent = document.createElement("div");
    panelsParent.classList.add("panel-parent", "is-hidden"); // <-- hidden until table loads
    container.appendChild(panelsParent);

    await renderFilterPanel(columns, panelsParent);
    renderFieldsPanel(columns, panelsParent);
    renderBulkActionPanel(columns, panelsParent);
    renderUpdateButton(panelsParent);
    renderPushButton(panelsParent);

    // Build table
    await displayJSONTable(filteredData);

    // Reveal panels
    panelsParent.classList.remove("is-hidden");

    // ✅ Fade out spinner smoothly
    spinnerContainer.style.opacity = "1"; // ensure starting state
    spinnerContainer.style.transition = "opacity 0.5s ease";

    requestAnimationFrame(() => {
      spinnerContainer.style.opacity = "0"; // fade out
    });

    setTimeout(() => {
      spinnerContainer.remove();
    }, 600);

    // Collapse panels by default (optional)
    document
      .querySelectorAll(".filter-panel")
      .forEach((panel) => panel.classList.add("collapsed"));
    document
      .querySelectorAll(".filter-panel-header")
      .forEach((header) => header.classList.add("collapsed"));

  } catch (error) {
    console.error("Error fetching JSON:", error);
    spinnerMsg.textContent = "❌ Failed to load JSON data.";
  }
}


// --- FILTER PANEL (table-style with dynamic rows + remove buttons) ---
async function renderFilterPanel(columns, parent) {
  const panelContainer = document.createElement("div");
  panelContainer.classList.add("filter-panel-container");

  const panelHeader = document.createElement("div");
  panelHeader.classList.add("filter-panel-header");
  panelHeader.innerHTML = `Filters <span>&#9660;</span>`;
  panelContainer.appendChild(panelHeader);

  const filterPanel = document.createElement("div");
  filterPanel.classList.add("filter-panel");
  filterPanel.id = "filter-panel";

  // Table shell
  const table = document.createElement("table");
  table.id = "filter-table";
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  ["Field", "Value", "Remove"].forEach((h) => {
    const th = document.createElement("th");
    th.textContent = h;
    th.style.textAlign = "left";
    th.style.padding = "0.25rem 0.5rem";
    th.style.borderBottom = "1px solid #ddd";
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);

  const tbody = document.createElement("tbody");
  tbody.id = "filter-tbody";

  table.appendChild(thead);
  table.appendChild(tbody);

  // Add Filter button
  const addBtn = document.createElement("button");
  addBtn.textContent = "Add Filter";
  addBtn.type = "button";
  addBtn.style.marginTop = "0.5rem";

  // Row factory
  const addFilterRow = async (prefill = {}) => {
    const row = document.createElement("tr");

    // --- Column 1: Field selector ---
    const fieldTd = document.createElement("td");
    fieldTd.style.padding = "0.25rem 0.5rem";
    const fieldSelect = document.createElement("select");
    fieldSelect.classList.add("theme-select", "filter-field-select");

    // default empty option
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "-- choose field --";
    fieldSelect.appendChild(empty);

    columns.forEach((col) => {
      const opt = document.createElement("option");
      opt.value = col;
      opt.textContent = col;
      fieldSelect.appendChild(opt);
    });

    if (prefill.field) fieldSelect.value = prefill.field;

    fieldTd.appendChild(fieldSelect);
    row.appendChild(fieldTd);

    // --- Column 2: Value control (depends on field type) ---
    const valueTd = document.createElement("td");
    valueTd.style.padding = "0.25rem 0.5rem";
    row.appendChild(valueTd);

    // helper to render proper value control for current field
    const renderValueControl = async () => {
      valueTd.innerHTML = "";
      const selectedFieldName = fieldSelect.value;
      if (!selectedFieldName) {
        // nothing selected yet — show disabled input
        const input = document.createElement("input");
        input.type = "text";
        input.placeholder = "Select a field first";
        input.disabled = true;
        input.style.opacity = 0.6;
        valueTd.appendChild(input);
        return;
      }

      const field = fieldMap.find((f) => f.name === selectedFieldName);

      if (field && field.fieldType === "List/Record") {
        const select = document.createElement("select");
        select.classList.add("theme-select", "filter-value-select");
        select.dataset.field = selectedFieldName;

        // Default option: All (no filter)
        const all = document.createElement("option");
        all.value = "";
        all.textContent = "All";
        select.appendChild(all);

        const options = await getListOptions(field);
        options.forEach((opt) => {
          const o = document.createElement("option");
          o.value = opt["Name"]; // we compare by Name in filtering
          o.textContent = opt["Name"];
          select.appendChild(o);
        });

        if (prefill.value && prefill.field === selectedFieldName) {
          select.value = prefill.value;
        }

        select.addEventListener("change", applyFilters);
        valueTd.appendChild(select);
      } else {
        const input = document.createElement("input");
        input.type = "text";
        input.classList.add("filter-value-input");
        input.dataset.field = selectedFieldName;
        input.placeholder = "Type to filter (contains)";

        if (prefill.value && prefill.field === selectedFieldName) {
          input.value = prefill.value;
        }

        input.addEventListener("input", () => {
          applyFilters();
        });
        valueTd.appendChild(input);
      }
    };

    // initialize value control for the initial field (if any)
    await renderValueControl();

    // when the field changes, re-render the value control
    fieldSelect.addEventListener("change", async () => {
      await renderValueControl();
      applyFilters();
    });

    // --- Column 3: Remove button ---
    const removeTd = document.createElement("td");
    removeTd.style.padding = "0.25rem 0.5rem";
    removeTd.style.width = "1%";

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.textContent = "×";
    removeBtn.title = "Remove this filter";
    removeBtn.classList.add("filter-remove-btn");

    removeBtn.addEventListener("click", async () => {
      row.remove();
      // If all rows are gone, add a fresh blank row so the panel isn't empty
      if (!tbody.querySelector("tr")) {
        await addFilterRow();
      }
      applyFilters();
    });

    removeTd.appendChild(removeBtn);
    row.appendChild(removeTd);

    tbody.appendChild(row);
  };

  // Start with one blank filter row
  await addFilterRow();

  // Wire the "Add Filter" button
  addBtn.addEventListener("click", () => addFilterRow());

  // assemble the panel
  filterPanel.appendChild(table);
  filterPanel.appendChild(addBtn);
  panelContainer.appendChild(filterPanel);
  parent.appendChild(panelContainer);

  // collapse/expand
  panelHeader.addEventListener("click", () => {
    filterPanel.classList.toggle("collapsed");
    panelHeader.classList.toggle("collapsed");
  });
}



// --- FIELDS PANEL ---
function renderFieldsPanel(columns, parent) {
  const panelContainer = document.createElement("div");
  panelContainer.classList.add("filter-panel-container");

  const panelHeader = document.createElement("div");
  panelHeader.classList.add("filter-panel-header");
  panelHeader.innerHTML = `Fields <span>&#9660;</span>`;
  panelContainer.appendChild(panelHeader);

  const fieldsPanel = document.createElement("div");
  fieldsPanel.classList.add("filter-panel");
  fieldsPanel.id = "fields-panel";

  const table = document.createElement("table");
  table.style.width = "100%";
  const colsPerRow = 4;
  let row;

  columns.forEach((col, index) => {
    if (index % colsPerRow === 0) row = document.createElement("tr");

    const cell = document.createElement("td");
    cell.style.border = "none";
    cell.style.padding = "0.25rem";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.column = col;
    checkbox.checked = displayedColumns.includes(col);

    const label = document.createElement("label");
    label.textContent = col;
    label.style.marginLeft = "0.25rem";
    if (toolColumns.includes(col)) label.classList.add("tool-column-header");

    checkbox.addEventListener("change", () => {
      updateDisplayedColumns();
      displayJSONTable(filteredData);
    });

    cell.appendChild(checkbox);
    cell.appendChild(label);
    row.appendChild(cell);

    if (index % colsPerRow === colsPerRow - 1 || index === columns.length - 1)
      table.appendChild(row);
  });

  fieldsPanel.appendChild(table);
  panelContainer.appendChild(fieldsPanel);
  parent.appendChild(panelContainer);

  panelHeader.addEventListener("click", () => {
    fieldsPanel.classList.toggle("collapsed");
    panelHeader.classList.toggle("collapsed");
  });

  updateDisplayedColumns();
}

// --- BULK ACTION PANEL ---
function renderBulkActionPanel(columns, parent) {
  const panelContainer = document.createElement("div");
  panelContainer.classList.add("filter-panel-container");

  const panelHeader = document.createElement("div");
  panelHeader.classList.add("filter-panel-header");
  panelHeader.innerHTML = `Bulk Action <span>&#9660;</span>`;
  panelContainer.appendChild(panelHeader);

  const bulkPanel = document.createElement("div");
  bulkPanel.classList.add("filter-panel");
  bulkPanel.id = "bulk-panel";

  const columnSelect = document.createElement("select");
  columnSelect.id = "bulk-column-select";
  columns.forEach((col) => {
    const option = document.createElement("option");
    option.value = col;
    option.textContent = col;
    columnSelect.appendChild(option);
  });

  // Input (for normal numeric fields)
  const valueInput = document.createElement("input");
  valueInput.type = "number";
  valueInput.id = "bulk-value-input";
  valueInput.placeholder = "Enter value";

  // Dropdown (for list/record fields)
  const valueSelect = document.createElement("select");
  valueSelect.id = "bulk-value-select";
  valueSelect.classList.add("theme-select");
  valueSelect.style.display = "none"; // hidden by default

  // Action dropdown
  const actionSelect = document.createElement("select");
  actionSelect.id = "bulk-action-select";
  ["Add By Value", "Add By Percent"].forEach((action) => {
    const option = document.createElement("option");
    option.value = action;
    option.textContent = action;
    actionSelect.appendChild(option);
  });

  const applyBtn = document.createElement("button");
  applyBtn.textContent = "Apply";
  applyBtn.addEventListener("click", async () => {
    const col = columnSelect.value;
    const field = fieldMap.find((f) => f.name === col);

    if (field && field.fieldType === "List/Record") {
      applyBulkAction(col, valueSelect.value, "Set List Value");
    } else {
      applyBulkAction(col, valueInput.value, actionSelect.value);
    }
  });

  bulkPanel.appendChild(columnSelect);
  bulkPanel.appendChild(valueInput);
  bulkPanel.appendChild(valueSelect);
  bulkPanel.appendChild(actionSelect);
  bulkPanel.appendChild(applyBtn);

  panelContainer.appendChild(bulkPanel);
  parent.appendChild(panelContainer);

  panelHeader.addEventListener("click", () => {
    bulkPanel.classList.toggle("collapsed");
    panelHeader.classList.toggle("collapsed");
  });

  // Change behavior when column changes
  columnSelect.addEventListener("change", async () => {
    const col = columnSelect.value;
    const field = fieldMap.find((f) => f.name === col);

    if (field && field.fieldType === "List/Record") {
      // Show dropdown, hide numeric + action
      valueInput.style.display = "none";
      actionSelect.style.display = "none";
      valueSelect.style.display = "inline-block";

      // Load options
      const options = await getListOptions(field);
      valueSelect.innerHTML = "";
      options.forEach((opt) => {
        const option = document.createElement("option");
        option.value = opt["Internal ID"];
        option.textContent = opt["Name"];
        valueSelect.appendChild(option);
      });
    } else {
      // Show numeric + action, hide dropdown
      valueInput.style.display = "inline-block";
      actionSelect.style.display = "inline-block";
      valueSelect.style.display = "none";
    }
  });
}


// --- UPDATE BUTTON ---
function renderUpdateButton(parent) {
  const updateBtn = document.createElement("button");
  updateBtn.textContent = "Update";
  updateBtn.style.padding = "0.5rem 1rem";
  updateBtn.style.border = "none";
  updateBtn.style.borderRadius = "4px";
  updateBtn.style.cursor = "pointer";
  //updateBtn.style.marginTop = "1rem";
  updateBtn.addEventListener("click", applyUpdates);
  parent.appendChild(updateBtn);
}

// --- PUSH BUTTON ---
function renderPushButton(parent) {
  const pushBtn = document.createElement("button");
  pushBtn.textContent = "Push";
  pushBtn.style.padding = "0.5rem 1rem";
  pushBtn.style.border = "none";
  pushBtn.style.borderRadius = "4px";
  pushBtn.style.cursor = "pointer";
  //pushBtn.style.marginTop = "1rem";
  pushBtn.addEventListener("click", pushUpdates);
  parent.appendChild(pushBtn);

  const progressContainer = document.createElement("div");
  progressContainer.id = "push-progress-container";
  progressContainer.style.marginTop = "0.5rem";
  parent.appendChild(progressContainer);
}

// --- BULK ACTION LOGIC ---
function applyBulkAction(column, value, action) {
  if (!column || value === "") return;

  const table = document.querySelector("table.csv-table");
  if (!table) return;

  const rows = table.querySelectorAll("tr");
  rows.forEach((row, index) => {
    if (index === 0) return;
    const checkbox = row.querySelector("td input[type='checkbox']");
    if (!checkbox || !checkbox.checked) return;

    const rowIndex = index - 1;
    const rowData = filteredData[rowIndex];

    if (action === "Set List Value") {
      // for List/Record fields
      const field = fieldMap.find((f) => f.name === column);
      const options = listCache[field.name] || [];
      const selected = options.find((o) => o["Internal ID"] === value);
      rowData[column] = selected ? selected["Name"] : "";
      rowData[`${column}_InternalId`] = value;
    } else {
      // numeric logic
      const numValue = parseFloat(value);
      if (isNaN(numValue)) return;

      const oldVal = parseFloat(rowData[column]) || 0;
      if (action === "Add By Value") rowData[column] = oldVal + numValue;
      else if (action === "Add By Percent")
        rowData[column] = oldVal * (1 + numValue / 100);
    }
  });

  displayJSONTable(filteredData);
}


// --- HELPER FUNCTIONS ---
function updateDisplayedColumns() {
  const checkedBoxes = document.querySelectorAll(
    "#fields-panel input[type='checkbox']:checked"
  );
  displayedColumns = Array.from(checkedBoxes).map((cb) => cb.dataset.column);
}

// --- APPLY FILTERS (unchanged, compatible with remove buttons) ---
function applyFilters() {
  const tbody = document.querySelector("#filter-tbody");
  if (!tbody) {
    filteredData = [...fullData];
    displayJSONTable(filteredData);
    return;
  }

  // build filter rules from each row
  const rules = [];
  Array.from(tbody.querySelectorAll("tr")).forEach((tr) => {
    const fieldSelect = tr.querySelector("select.filter-field-select");
    if (!fieldSelect) return;

    const fieldName = fieldSelect.value;
    if (!fieldName) return;

    // try dropdown first (List/Record)
    const valueSelect = tr.querySelector("select.filter-value-select");
    const valueInput = tr.querySelector("input.filter-value-input");

    let value = "";
    if (valueSelect) value = valueSelect.value?.trim() ?? "";
    else if (valueInput) value = valueInput.value?.trim() ?? "";

    // empty value means ignore this rule
    if (!value) return;

    // detect field type
    const fm = fieldMap.find((f) => f.name === fieldName);
    const isListRecord = fm && fm.fieldType === "List/Record";

    rules.push({ field: fieldName, value, isListRecord });
  });

  if (rules.length === 0) {
    filteredData = [...fullData];
    displayJSONTable(filteredData);
    return;
  }

  // apply AND logic across rules
  filteredData = fullData.filter((row) =>
    rules.every((r) => {
      const cell = row[r.field] != null ? String(row[r.field]) : "";
      if (r.isListRecord) {
        // List/Record: exact match on the Name
        return cell === r.value;
      } else {
        // Free text: contains, case-insensitive
        return cell.toLowerCase().includes(r.value.toLowerCase());
      }
    })
  );

  displayJSONTable(filteredData);
}



// --- TABLE RENDER ---
// --- TABLE RENDER (with fade-in) ---
async function displayJSONTable(data, opts = { showBusy: false }) {
  const container = document.getElementById("table-data");

  // Remove any existing table or "no data" message
  container.querySelectorAll("table.csv-table, p.no-data").forEach((el) => el.remove());

  // Optional local overlay spinner that belongs to THIS render call
  let localOverlay;
  if (opts.showBusy) {
    container.style.position = container.style.position || "relative";
    localOverlay = document.createElement("div");
    localOverlay.className = "table-build-overlay";
    localOverlay.innerHTML = `
      <div class="table-build-overlay__inner">
        <div class="spinner"></div>
        <p>Building table…</p>
      </div>
    `;
    container.appendChild(localOverlay);
  }

  try {
    if (!Array.isArray(data) || data.length === 0) {
      const msg = document.createElement("p");
      msg.textContent = "No data available.";
      msg.className = "no-data fade-in";
      container.appendChild(msg);
      // trigger fade-in
      requestAnimationFrame(() => msg.classList.add("show"));
      return;
    }

    // Preload list options for all List/Record columns that will be displayed (once).
    const listRecordCols = displayedColumns
      .map((name) => fieldMap.find((f) => f.name === name))
      .filter((f) => f && f.fieldType === "List/Record");

    const optionsByFieldName = {};
    await Promise.all(
      listRecordCols.map(async (field) => {
        optionsByFieldName[field.name] = await getListOptions(field);
      })
    );

    const table = document.createElement("table");
    table.classList.add("csv-table", "fade-in"); // start transparent

    // Header
    const headerRow = document.createElement("tr");

    const selectAllTh = document.createElement("th");
    const selectAllCheckbox = document.createElement("input");
    selectAllCheckbox.type = "checkbox";
    selectAllTh.appendChild(selectAllCheckbox);
    headerRow.appendChild(selectAllTh);

    displayedColumns.forEach((col) => {
      const th = document.createElement("th");
      th.textContent = col;
      if (toolColumns.includes(col)) th.classList.add("tool-column-header");
      headerRow.appendChild(th);
    });
    table.appendChild(headerRow);

    // “Select all” wiring
    selectAllCheckbox.addEventListener("change", () => {
      const rowCheckboxes = table.querySelectorAll("td input[type='checkbox']");
      rowCheckboxes.forEach((cb) => {
        cb.checked = selectAllCheckbox.checked;
        highlightRow(cb);
      });
    });

    // Build rows efficiently
    const frag = document.createDocumentFragment();
    const rows = data.slice(0, MAX_ROWS);

    for (let r = 0; r < rows.length; r++) {
      const rowData = rows[r];
      const row = document.createElement("tr");

      // Select cell
      const checkboxTd = document.createElement("td");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.addEventListener("change", () => highlightRow(checkbox));
      checkboxTd.appendChild(checkbox);
      row.appendChild(checkboxTd);

      // Data cells
      for (const col of displayedColumns) {
        const td = document.createElement("td");
        const field = fieldMap.find((f) => f.name === col);

        if (field && field.fieldType === "List/Record") {
          const select = document.createElement("select");
          select.classList.add("theme-select");
          if (field.name === "Class") select.style.maxWidth = "180px";

          const options = optionsByFieldName[field.name] || [];
          for (const opt of options) {
            const option = document.createElement("option");
            option.value = opt["Internal ID"];
            option.textContent = opt["Name"];
            if (rowData[col] === opt["Name"]) option.selected = true;
            select.appendChild(option);
          }

          select.addEventListener("change", () => {
            const selected = (optionsByFieldName[field.name] || []).find(
              (o) => o["Internal ID"] === select.value
            );
            rowData[col] = selected ? selected["Name"] : "";
            rowData[`${col}_InternalId`] = select.value;
          });

          td.appendChild(select);
        } else {
          td.textContent = rowData[col] || "";
          td.contentEditable = true;
        }

        row.appendChild(td);
      }

      // Parent highlight
      if (String(rowData["Is Parent"]).toLowerCase() === "true") {
        row.querySelectorAll("td").forEach((td) => (td.style.backgroundColor = "#FFD700"));
      }

      frag.appendChild(row);
    }

    table.appendChild(frag);
    container.appendChild(table);

    // Trigger the fade-in after the table is in the DOM
    requestAnimationFrame(() => {
      table.classList.add("show");
    });

  } finally {
    // Ensure the local overlay is removed after this render finishes
    if (localOverlay) {
      localOverlay.style.transition = "opacity 200ms ease";
      localOverlay.style.opacity = "0";
      setTimeout(() => localOverlay.remove(), 220);
    }
  }
}



// --- ROW HIGHLIGHT ---
function highlightRow(checkbox) {
  const row = checkbox.closest("tr");
  const rowIndex = row.rowIndex - 1;

  if (
    filteredData[rowIndex] &&
    String(filteredData[rowIndex]["Is Parent"]).toLowerCase() === "true"
  ) {
    row
      .querySelectorAll("td")
      .forEach((td) => (td.style.backgroundColor = "#FFD700"));
    return;
  }

  row.querySelectorAll("td").forEach((td, i) => {
    if (i === 0) return;
    td.style.backgroundColor = checkbox.checked
      ? "#e0f7fa"
      : row.rowIndex % 2 === 0
      ? ""
      : "#f9f9f9";
  });
}

// --- APPLY UPDATES ---
function applyUpdates() {
  const table = document.querySelector("table.csv-table");
  if (!table) return;

  const rows = table.querySelectorAll("tr");
  rows.forEach((row, index) => {
    if (index === 0) return;

    const checkbox = row.querySelector("td input[type='checkbox']");
    if (!checkbox || !checkbox.checked) return;

    const rowIndex = index - 1;
    const rowData = filteredData[rowIndex];

    const retailIdx = displayedColumns.indexOf("Retail Price") + 1;
    const baseIdx = displayedColumns.indexOf("Base Price") + 1;
    const marginIdx = displayedColumns.indexOf("Margin") + 1;

    const retailTd = row.children[retailIdx];
    const baseTd = row.children[baseIdx];
    const marginTd = row.children[marginIdx];

    const oldRetail = parseFloat(rowData["Retail Price"]) || 0;
    const oldBase = parseFloat(rowData["Base Price"]) || oldRetail;

    const newRetail = parseFloat(retailTd?.textContent) || oldRetail;

    const changePct = newRetail / oldRetail;

    rowData["Retail Price"] = newRetail;
    rowData["Base Price"] = (oldBase * changePct).toFixed(2);
    rowData["Margin"] = (
      (rowData["Retail Price"] / rowData["Base Price"] - 1) *
      100
    ).toFixed(2);

    if (retailTd) retailTd.textContent = rowData["Retail Price"];
    if (baseTd) baseTd.textContent = rowData["Base Price"];
    if (marginTd) marginTd.textContent = rowData["Margin"];
  });

  displayJSONTable(filteredData);
}

const API_BASE = "http://localhost:3000"; // ✅ backend server

async function pushUpdates() {
  const table = document.querySelector("table.csv-table");
  if (!table) return alert("No table found!");

  const rows = Array.from(table.querySelectorAll("tr")).slice(1);
  const rowsToPush = [];

  rows.forEach((row, idx) => {
    const checkbox = row.querySelector("td input[type='checkbox']");
    if (!checkbox || !checkbox.checked) return;

    const rowData = {};
    displayedColumns.forEach((col, colIdx) => {
      const field = fieldMap.find((f) => f.name === col);
      if (field && field.fieldType === "List/Record") {
        const select = row.children[colIdx + 1].querySelector("select");
        rowData[col] = select.value;
        rowData[`${col}_InternalId`] = select.value;
      } else {
        rowData[col] = row.children[colIdx + 1].textContent;
      }
    });
    rowsToPush.push(rowData);
  });

  if (rowsToPush.length === 0) return alert("No rows selected to push.");

  const progressContainer = document.getElementById("push-progress-container");
  if (progressContainer) {
    progressContainer.innerHTML = `<p>Queueing push of ${rowsToPush.length} rows...</p>`;
  }

  try {
    // Step 1: enqueue job
    const response = await fetch(`${API_BASE}/push-updates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: rowsToPush }),
    });

    const data = await response.json();
    if (!data.success) {
      if (progressContainer) {
        progressContainer.innerHTML = `<p style="color:red;">❌ Failed to queue push: ${data.message}</p>`;
      }
      window.updateFooterProgress(0, rowsToPush.length, "error", 0, 0);
      return;
    }

    const { jobId, queuePos, queueTotal } = data;
    localStorage.setItem("lastJobId", jobId);

    if (progressContainer) {
      progressContainer.innerHTML = `<p>🚀 Job queued (Job ${queuePos} of ${queueTotal})</p>`;
    }
    window.updateFooterProgress(0, rowsToPush.length, "pending", queuePos, queueTotal);

    // Step 2: poll job status
    const interval = setInterval(async () => {
      try {
        const statusRes = await fetch(`${API_BASE}/push-status/${jobId}`);
        const statusData = await statusRes.json();

        if (!statusData || !statusData.status) {
          if (progressContainer) {
            progressContainer.innerHTML += `<p style="color:red;">❌ Lost job status</p>`;
          }
          window.updateFooterProgress(0, rowsToPush.length, "error", 0, 0);
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

          // Count successes (200 or 204 are good)
          const successCount = results.filter(
            (r) => r.status === 200 || r.status === 204
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
        window.updateFooterProgress(0, rowsToPush.length, "error", 0, 0);
        clearInterval(interval);
      }
    }, 3000); // poll every 3s
  } catch (err) {
    console.error("Error starting push:", err);
    if (progressContainer) {
      progressContainer.innerHTML = `<p style="color:red;">❌ Push failed: ${err.message}</p>`;
    }
    window.updateFooterProgress(0, rowsToPush.length, "error", 0, 0);
  }
}


// --- STYLING ---
const style = document.createElement("style");
style.textContent = `
  select.theme-select {
    padding: 0.25rem 0.5rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    background-color: #fff;
    font-size: 0.9rem;
    font-family: inherit;
  }
  select.theme-select:focus {
    border-color: #009688;
    outline: none;
    box-shadow: 0 0 3px rgba(0,150,136,0.5);
  }
   #filter-table th, #filter-table td {
    vertical-align: middle;
  }
  #filter-panel button[type="button"] {
    padding: 0.4rem 0.8rem;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    margin-top: 0.25rem;
  }
   .filter-remove-btn {
    padding: 0.2rem 0.5rem;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    line-height: 1;
  }
`;
document.head.appendChild(style);

window.addEventListener("DOMContentLoaded", loadJSONData);
