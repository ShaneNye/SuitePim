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

const MAX_ROWS = 100;





// ✅ List of tool-generated columns
const toolColumns = ["Retail Price", "Margin"];

let fullData = [];
let filteredData = [];
let displayedColumns = [];
let baselineData = [];
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
    // --- 1) Fetch main JSON dataset
    const response = await fetch(jsonUrl);
    if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);

    fullData = await response.json();

    // Apply tool columns
    if (typeof window.addRetailPriceTool === "function")
      fullData = window.addRetailPriceTool(fullData);
    if (typeof window.addMarginTool === "function")
      fullData = window.addMarginTool(fullData);

    filteredData = [...fullData];
    baselineData = JSON.parse(JSON.stringify(fullData));

    const columns = Object.keys(fullData[0] || {});
    displayedColumns = [
      ...columns.slice(0, 7),
      ...toolColumns.filter((tc) => !columns.slice(0, 7).includes(tc)),
    ];

    // --- 2) Preload all List/Record feeds
    const preloadPromises = fieldMap
      .filter((f) => f.fieldType === "List/Record" && f.jsonFeed)
      .map(async (f) => {
        try {
          const res = await fetch(f.jsonFeed);
          if (!res.ok) throw new Error(`Feed ${f.name} failed`);
          const data = await res.json();
          listCache[f.name] = data; // cache immediately
        } catch (err) {
          console.warn(`⚠️ Failed to preload options for ${f.name}:`, err);
          listCache[f.name] = []; // fallback to empty
        }
      });

    await Promise.all(preloadPromises);

    // --- 3) Build panels (hidden until table is ready)
    const panelsParent = document.createElement("div");
    panelsParent.classList.add("panel-parent", "is-hidden");
    container.appendChild(panelsParent);

    await renderFilterPanel(columns, panelsParent);
    renderFieldsPanel(columns, panelsParent);
    renderBulkActionPanel(columns, panelsParent);
    renderUpdateButton(panelsParent);
    renderPushButton(panelsParent);

    // --- 4) Build table
    await displayJSONTable(filteredData);

    // Reveal panels
    panelsParent.classList.remove("is-hidden");

    // ✅ Fade out spinner smoothly
    spinnerContainer.style.opacity = "1";
    spinnerContainer.style.transition = "opacity 0.5s ease";
    requestAnimationFrame(() => {
      spinnerContainer.style.opacity = "0";
    });
    setTimeout(() => spinnerContainer.remove(), 600);

    // Collapse panels by default
    document.querySelectorAll(".filter-panel")
      .forEach((panel) => panel.classList.add("collapsed"));
    document.querySelectorAll(".filter-panel-header")
      .forEach((header) => header.classList.add("collapsed"));

  } catch (error) {
    console.error("Error loading data:", error);
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

    const renderValueControl = async () => {
      valueTd.innerHTML = "";
      const selectedFieldName = fieldSelect.value;
      if (!selectedFieldName) {
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

        const all = document.createElement("option");
        all.value = "";
        all.textContent = "All";
        select.appendChild(all);

        const options = await getListOptions(field);
        options.forEach((opt) => {
          const o = document.createElement("option");
          o.value = opt["Name"];
          o.textContent = opt["Name"];
          select.appendChild(o);
        });

        if (prefill.value && prefill.field === selectedFieldName) {
          select.value = prefill.value;
        }

        valueTd.appendChild(select);

      } else if (field && field.fieldType === "Checkbox") {
        const select = document.createElement("select");
        select.classList.add("theme-select", "filter-value-select");
        select.dataset.field = selectedFieldName;

        const all = document.createElement("option");
        all.value = "";
        all.textContent = "All";
        select.appendChild(all);

        const trueOpt = document.createElement("option");
        trueOpt.value = "true";
        trueOpt.textContent = "True";
        select.appendChild(trueOpt);

        const falseOpt = document.createElement("option");
        falseOpt.value = "false";
        falseOpt.textContent = "False";
        select.appendChild(falseOpt);

        if (prefill.value && prefill.field === selectedFieldName) {
          select.value = prefill.value;
        }

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

        valueTd.appendChild(input);
      }
    };

    await renderValueControl();

    fieldSelect.addEventListener("change", async () => {
      await renderValueControl();
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
      if (!tbody.querySelector("tr")) {
        await addFilterRow();
      }
    });

    removeTd.appendChild(removeBtn);
    row.appendChild(removeTd);

    tbody.appendChild(row);
  };

  await addFilterRow();
  addBtn.addEventListener("click", () => addFilterRow());

  // --- Apply button ---
  const applyBtn = document.createElement("button");
  applyBtn.textContent = "Apply";
  applyBtn.type = "button";
  applyBtn.style.marginTop = "0.5rem";
  applyBtn.style.float = "right";
  applyBtn.addEventListener("click", () => {
    applyFilters();
  });

  filterPanel.appendChild(table);
  filterPanel.appendChild(addBtn);
  filterPanel.appendChild(applyBtn);
  panelContainer.appendChild(filterPanel);
  parent.appendChild(panelContainer);

  // collapse/expand (sync with Fields)
  panelHeader.addEventListener("click", () => {
    const isCollapsed = filterPanel.classList.contains("collapsed");

    filterPanel.classList.toggle("collapsed", !isCollapsed);
    panelHeader.classList.toggle("collapsed", !isCollapsed);

    const fieldsPanel = document.getElementById("fields-panel");
    const fieldsHeader = fieldsPanel?.previousElementSibling;
    if (fieldsPanel && fieldsHeader) {
      fieldsPanel.classList.toggle("collapsed", !isCollapsed);
      fieldsHeader.classList.toggle("collapsed", !isCollapsed);
    }
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

  // collapse/expand (sync with Filters)
  panelHeader.addEventListener("click", () => {
    const isCollapsed = fieldsPanel.classList.contains("collapsed");

    fieldsPanel.classList.toggle("collapsed", !isCollapsed);
    panelHeader.classList.toggle("collapsed", !isCollapsed);

    const filterPanel = document.getElementById("filter-panel");
    const filterHeader = filterPanel?.previousElementSibling;
    if (filterPanel && filterHeader) {
      filterPanel.classList.toggle("collapsed", !isCollapsed);
      filterHeader.classList.toggle("collapsed", !isCollapsed);
    }
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

  // Input (for numeric fields)
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
  ["Set To", "Add By Value", "Add By Percent"].forEach((action) => {
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

function applyBulkAction(column, value, action) {
  if (!column || value === "") return;

  const table = document.querySelector("table.csv-table");
  if (!table) return;

  // Which rows are checked (no <tbody> dependency)
  const checkedRowIndices = new Set();
  const allRowCbs = table.querySelectorAll('tr input[type="checkbox"].row-selector');
  const allChecked = [...allRowCbs].every(cb => cb.checked);

  table.querySelectorAll("tr").forEach((row, index) => {
    if (index === 0) return; // skip header
    const checkbox = row.querySelector('td input[type="checkbox"].row-selector');
    if (checkbox && checkbox.checked) checkedRowIndices.add(index - 1); // data index
  });

  const KEY_FIELDS = ["Purchase Price", "Base Price", "Retail Price", "Margin"];
  const isKeyField = KEY_FIELDS.includes(column);

  // Normalize action labels we’ll accept for “set”
  const isSetTo =
    action === "Set To" ||
    action === "Set" ||
    action === "Set Value" ||
    action === "Overwrite";

  checkedRowIndices.forEach((rowIndex) => {
    let rowData = { ...filteredData[rowIndex] };

    if (action === "Set List Value") {
      // list field handling unchanged
      const field = fieldMap.find((f) => f.name === column);
      const options = (listCache[field?.name] || []);
      const selected = options.find((o) => o["Internal ID"] === value);
      rowData[column] = selected ? selected["Name"] : "";
      rowData[`${column}_InternalId`] = value;
    } else {
      // numeric bulk actions
      const numValue = parseFloat(value);
      if (Number.isNaN(numValue)) return;

      const oldVal = parseFloat(rowData[column]) || 0;

      if (isSetTo) {
        rowData[column] = numValue;
      } else if (action === "Add By Value") {
        rowData[column] = oldVal + numValue;
      } else if (action === "Add By Percent") {
        rowData[column] = oldVal * (1 + numValue / 100);
      } else {
        // unknown action -> do nothing
        return;
      }
    }

    // Recalculate if we touched a pricing driver
    if (isKeyField && typeof window.recalcRow === "function") {
      rowData = window.recalcRow(rowData, column);
    }

    // Save & sync baseline for reliable future detection
    filteredData[rowIndex] = rowData;
    if (Array.isArray(baselineData)) baselineData[rowIndex] = { ...rowData };
  });

  // Re-render and restore checks/highlights
  displayJSONTable(filteredData).then(() => {
    const newRows = document.querySelectorAll("table.csv-table tr");
    newRows.forEach((row, index) => {
      if (index === 0) return;
      const cb = row.querySelector('td input[type="checkbox"].row-selector');
      if (cb && checkedRowIndices.has(index - 1)) {
        cb.checked = true;
        row.classList.add("selected");
      }
    });

    // Restore "select all" if present and previously all were checked
    const selectAll = document.querySelector('input[type="checkbox"].select-all');
    if (selectAll && allChecked) selectAll.checked = true;
  });
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
    displayJSONTable(filteredData, { showAll: false }); // no filters → cap 500
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
    // --- No filters → reset to 500 row cap
    filteredData = [...fullData];
    displayJSONTable(filteredData, { showAll: false });
    return;
  }

  // --- Apply AND logic across rules
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

  // --- Filters active → show all rows
  displayJSONTable(filteredData, { showAll: true });
}


// --- TABLE RENDER (with fade-in + resizable columns + safe Link rendering) ---
async function displayJSONTable(data, opts = { showBusy: false }) {
  const container = document.getElementById("table-data");

  // Remove any existing table or "no data" message
  container.querySelectorAll("table.csv-table, p.no-data").forEach((el) => el.remove());

  // Optional overlay spinner
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
      requestAnimationFrame(() => msg.classList.add("show"));
      return;
    }

    // Preload list options for list/record fields
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
    table.classList.add("csv-table", "fade-in");
    table.style.tableLayout = "fixed"; // enforce colgroup widths

    // --- Colgroup for resizable columns ---
    const colgroup = document.createElement("colgroup");
    for (let i = 0; i < displayedColumns.length + 1; i++) {
      const col = document.createElement("col");
      col.style.width = i === 0 ? "40px" : "150px"; // default widths (first is selector)
      colgroup.appendChild(col);
    }
    table.appendChild(colgroup);

    // --- Header ---
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");

    // Select-all checkbox
    const selectAllTh = document.createElement("th");
    const selectAllCheckbox = document.createElement("input");
    selectAllCheckbox.type = "checkbox";
    selectAllTh.appendChild(selectAllCheckbox);
    headerRow.appendChild(selectAllTh);

    displayedColumns.forEach((col, i) => {
      const th = document.createElement("th");
      th.textContent = col;
      if (toolColumns.includes(col)) th.classList.add("tool-column-header");

      // Resizer handle
      const resizer = document.createElement("div");
      resizer.className = "resize-handle";
      th.appendChild(resizer);

      let startX, startWidth;
      resizer.addEventListener("mousedown", (e) => {
        e.preventDefault();
        startX = e.pageX;
        startWidth = colgroup.children[i + 1].offsetWidth; // +1 for selector column

        const onMouseMove = (e) => {
          const newWidth = Math.max(60, startWidth + (e.pageX - startX));
          colgroup.children[i + 1].style.width = newWidth + "px";
        };

        const onMouseUp = () => {
          document.removeEventListener("mousemove", onMouseMove);
          document.removeEventListener("mouseup", onMouseUp);
        };

        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
      });

      headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);
    table.appendChild(thead);

    // --- Select all wiring ---
    selectAllCheckbox.addEventListener("change", () => {
      const rowCheckboxes = table.querySelectorAll("td input[type='checkbox'].row-selector");
      rowCheckboxes.forEach((cb) => {
        cb.checked = selectAllCheckbox.checked;
        highlightRow(cb);
      });
    });

    // --- Body ---
    const tbody = document.createElement("tbody");
    const rows = opts.showAll ? data : data.slice(0, MAX_ROWS);


    // helper: safely render a value that may contain an <a> tag from JSON
    const renderLinkValue = (raw) => {
      if (typeof raw !== "string") return null;
      // quick check to avoid creating elements unnecessarily
      if (!/<a\s+[^>]*href=/i.test(raw)) return null;

      // Parse safely & extract just the anchor
      const tpl = document.createElement("template");
      tpl.innerHTML = raw.trim();
      const a = tpl.content.querySelector("a");
      if (!a) return null;

      const link = document.createElement("a");
      link.href = a.href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = a.textContent || a.href;
      return link;
    };

    for (let r = 0; r < rows.length; r++) {
      const rowData = rows[r];
      const row = document.createElement("tr");
      row.dataset.index = String(r);

      // Row selector
      const checkboxTd = document.createElement("td");
      const rowCheckbox = document.createElement("input");
      rowCheckbox.type = "checkbox";
      rowCheckbox.classList.add("row-selector");
      rowCheckbox.addEventListener("change", () => highlightRow(rowCheckbox));
      checkboxTd.appendChild(rowCheckbox);
      row.appendChild(checkboxTd);

      // Data cells
      for (const col of displayedColumns) {
        const td = document.createElement("td");
        const field = fieldMap.find((f) => f.name === col);
        const rawVal = rowData[col];

        if (field && field.fieldType === "List/Record") {
          // Dropdown
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
            rowCheckbox.checked = true;
            highlightRow(rowCheckbox);
          });

          td.appendChild(select);

        } else if (field && field.fieldType === "Checkbox") {
          // Checkbox
          const cb = document.createElement("input");
          cb.type = "checkbox";
          cb.checked =
            String(rawVal).toLowerCase() === "true" ||
            rawVal === "1" ||
            rawVal === true;

          cb.addEventListener("change", () => {
            rowData[col] = cb.checked;
            rowCheckbox.checked = true;
            highlightRow(rowCheckbox);
          });

          td.style.textAlign = "center";
          td.appendChild(cb);

        } else if (["Purchase Price", "Base Price", "Retail Price", "Margin"].includes(col)) {
          // Numeric input
          const input = document.createElement("input");
          input.type = "number";
          if (col === "Margin") input.step = "0.1";
          else if (col === "Retail Price") input.step = "1";
          else input.step = "0.01";
          input.value = rawVal || "";
          input.addEventListener("input", () => {
            rowData[col] = input.value;
            rowCheckbox.checked = true;
            highlightRow(rowCheckbox);
          });
          td.appendChild(input);

        } else if (col === "Internal ID") {
          // Read-only ID
          td.textContent = rawVal || "";
          td.style.color = "#666";
          td.style.backgroundColor = "#f5f5f5";
          td.style.cursor = "not-allowed";

        // 🔹 Link FIRST (either explicit field type OR auto-detect raw <a ...>)
        } else if ((field && field.fieldType === "Link") || (typeof rawVal === "string" && /<a\s+[^>]*href=/i.test(rawVal))) {
          const linkEl = renderLinkValue(rawVal);
          if (linkEl) {
            td.appendChild(linkEl);
          } else {
            td.textContent = rawVal || "";
          }
          // mark visually read-only (optional styling)
          td.style.backgroundColor = "#f5f5f5";
          td.style.cursor = "default";

        } else if (field && field.fieldType === "Free-Form Text") {
          // Textarea (invisible styling handled by CSS)
          const textarea = document.createElement("textarea");
          textarea.value = rawVal || "";
          textarea.rows = 2;
          textarea.style.resize = "none";
          textarea.addEventListener("input", () => {
            rowData[col] = textarea.value;
            rowCheckbox.checked = true;
            highlightRow(rowCheckbox);
          });
          td.appendChild(textarea);

        } else {
          // Default text input
          const input = document.createElement("input");
          input.type = "text";
          input.value = rawVal || "";
          input.addEventListener("input", () => {
            rowData[col] = input.value;
            rowCheckbox.checked = true;
            highlightRow(rowCheckbox);
          });
          td.appendChild(input);
        }

        row.appendChild(td);
      }

      tbody.appendChild(row);
      highlightRow(rowCheckbox);
    }

    table.appendChild(tbody);
    container.appendChild(table);

    requestAnimationFrame(() => {
      table.classList.add("show");
    });
  } finally {
    if (localOverlay) {
      localOverlay.style.transition = "opacity 200ms ease";
      localOverlay.style.opacity = "0";
      setTimeout(() => localOverlay.remove(), 220);
    }
  }
}


function highlightRow(checkboxOrRow) {
  const row = checkboxOrRow.closest ? checkboxOrRow.closest("tr") : checkboxOrRow;

  // Use dataset index (set when building rows) to map back to data
  const dataIndex = Number(row.dataset.index);
  const rowData = filteredData[dataIndex] || {};

  // Normalise checkbox values (booleans, "true"/"false", "T"/"F", "1"/"0", "Y"/"N")
  const isTrue = (v) => {
    if (v === true || v === 1) return true;
    if (typeof v === "string") {
      const val = v.trim().toLowerCase();
      return ["true", "t", "1", "y", "yes"].includes(val);
    }
    return false;
  };

  // Reset any old state
  row.classList.remove("is-parent", "is-inactive");

  // Apply Parent / Inactive classes from raw JSON data
  if (isTrue(rowData["Is Parent"])) {
    row.classList.add("is-parent");
  }
  if (isTrue(rowData["Inactive"])) {
    row.classList.add("is-inactive");
  }

  // Normal styling if not parent/inactive
  if (!row.classList.contains("is-parent") && !row.classList.contains("is-inactive")) {
    const selected = row.querySelector("input.row-selector")?.checked;
    row.querySelectorAll("td").forEach((td, i) => {
      if (i === 0) return; // skip selector col
      td.style.backgroundColor = selected
        ? "var(--row-select)"
        : (row.sectionRowIndex % 2 ? "#f9f9f9" : "");
      td.style.color = "";
    });
  } else {
    // Clear inline styles when class-based styling is applied
    row.querySelectorAll("td").forEach((td) => {
      td.style.backgroundColor = "";
      td.style.color = "";
    });
  }
}

function applyUpdates() {
  const table = document.querySelector("table.csv-table");
  if (!table) return;

  // Grab all rows, skip header
  const allRows = Array.from(table.querySelectorAll("tr"));
  const rows = allRows.slice(1);

  // Headers for column lookup
  const headers = Array.from(allRows[0].querySelectorAll("td, th")).map(h =>
    h.textContent.trim()
  );

  const normalize = (col, val) => {
    if (val == null) return null;
    const n = parseFloat(val) || 0;
    switch (col) {
      case "Purchase Price":
      case "Base Price":
        return parseFloat(n.toFixed(2));
      case "Retail Price":
        return Math.round(n);
      case "Margin":
        return parseFloat(n.toFixed(1));
      default:
        return n;
    }
  };

  rows.forEach((rowEl, idx) => {
    const checkbox = rowEl.querySelector('td input[type="checkbox"]');
    if (!checkbox || !checkbox.checked) return;

    let rowData = { ...filteredData[idx] };

    const readNum = (col) => {
      const colIndex = headers.findIndex(h => h.toLowerCase() === col.toLowerCase());
      if (colIndex === -1) return null;
      const td = rowEl.children[colIndex];
      if (!td) return null;
      const el = td.querySelector("input, select, textarea");
      let raw = el ? el.value : td.textContent;
      if (!raw) return null;
      const n = parseFloat(raw.replace(/[^\d.\-]/g, ""));
      return Number.isFinite(n) ? n : null;
    };

    // DOM values
    const domP = readNum("Purchase Price");
    const domB = readNum("Base Price");
    const domR = readNum("Retail Price");
    const domM = readNum("Margin");

    // Original values from baselineData (snapshot before edits)
    const orig = baselineData[idx];
    const oP = normalize("Purchase Price", orig["Purchase Price"]);
    const oB = normalize("Base Price", orig["Base Price"]);
    const oR = normalize("Retail Price", orig["Retail Price"]);
    const oM = normalize("Margin", orig["Margin"]);

    // Normalized DOM values
    const nP = domP != null ? normalize("Purchase Price", domP) : null;
    const nB = domB != null ? normalize("Base Price", domB) : null;
    const nR = domR != null ? normalize("Retail Price", domR) : null;
    const nM = domM != null ? normalize("Margin", domM) : null;

    // Detect which field changed (priority: Margin > Retail > Base > Purchase)
    let changedField = null;
    if (nM !== null && nM !== oM) changedField = "Margin";
    else if (nR !== null && nR !== oR) changedField = "Retail Price";
    else if (nB !== null && nB !== oB) changedField = "Base Price";
    else if (nP !== null && nP !== oP) changedField = "Purchase Price";

    if (!changedField) {
      console.log(`⏭️ Row ${idx}: no detected changes`);
      return;
    }

    // Apply DOM values into rowData
    if (domP !== null) rowData["Purchase Price"] = domP;
    if (domB !== null) rowData["Base Price"] = domB;
    if (domR !== null) rowData["Retail Price"] = domR;
    if (domM !== null) rowData["Margin"] = domM;

    console.log("⚡ calling recalcRow with", { idx, changedField, rowData });
    const updated = window.recalcRow(rowData, changedField);
    console.log("✅ after recalcRow", updated);

    filteredData[idx] = updated;
    baselineData[idx] = { ...updated }; // update baseline for future comparisons
  });

  // Re-render and restore selections
  displayJSONTable(filteredData).then(() => {
    rows.forEach((rowEl, idx) => {
      const checkbox = rowEl.querySelector('td input[type="checkbox"]');
      if (checkbox && checkbox.checked) {
        const newRow = document.querySelectorAll("table.csv-table tr")[idx + 1];
        if (newRow) {
          const cb = newRow.querySelector('td input[type="checkbox"]');
          if (cb) cb.checked = true;
          newRow.classList.add("selected");
        }
      }
    });
  });
}



const API_BASE = "http://localhost:3000"; // ✅ backend server

async function pushUpdates() {
  const table = document.querySelector("table.csv-table");
  if (!table) return alert("No table found!");

  const rows = Array.from(table.querySelectorAll("tr")).slice(1);
  const rowsToPush = [];

  rows.forEach((row, idx) => {
    const checkbox = row.querySelector("td input[type='checkbox'].row-selector");
    if (!checkbox || !checkbox.checked) return;

    const rowData = {};
    displayedColumns.forEach((col, colIdx) => {
      const td = row.children[colIdx + 1];
      if (!td) return;

      const field = fieldMap.find((f) => f.name === col);

      if (field && field.fieldType === "List/Record") {
        // --- List/Record select ---
        const select = td.querySelector("select");
        if (select) {
          const selectedId = select.value;
          const selectedText = select.options[select.selectedIndex]?.text || "";
          rowData[col] = selectedText;
          rowData[`${col}_InternalId`] = selectedId;
        }
      } else if (field && field.fieldType === "Checkbox") {
        // --- Boolean checkbox ---
        const cb = td.querySelector("input[type='checkbox']");
        rowData[col] = cb ? cb.checked : false;
      } else {
        // --- Inputs (text or number) or fallback to td text ---
        const input = td.querySelector("input");
        if (input) {
          rowData[col] = input.value;
        } else {
          rowData[col] = td.textContent.trim();
        }
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

    // --- Poll job status ---
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

          // ✅ Updated success/fail detection
          const successCount = results.filter(
            (r) =>
              r.status === "Success" ||
              r.status === 200 ||
              r.status === 204
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
    }, 3000);
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
