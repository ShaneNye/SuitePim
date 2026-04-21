// ProductData.js
import { fieldMap } from "./fieldMap.js";
import { openHistoricalPricingModal } from "./historicalPricing.js";

const SANDBOXjsonUrl =
  "https://7972741-sb1.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=4058&deploy=2&compid=7972741_SB1&ns-at=AAEJ7tMQ-74HtNHaDkUIVEeh7BJ5FkmE6ELyzq7-HDyCsW7QtU4";

const PRODjsonUrl =
  "https://7972741.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=4349&deploy=1&compid=7972741&ns-at=AAEJ7tMQJry3Xg_bYRGo6Nb9K7z8_2rleWv3_ujrUWhzaxks0Io";

// Pick environment (default Sandbox)
const environment = localStorage.getItem("environment") || "Sandbox";

const jsonUrl =
  environment.toLowerCase() === "production" ? PRODjsonUrl : SANDBOXjsonUrl;

const MAX_ROWS = 25;

// ✅ List of tool-generated columns
const toolColumns = ["Retail Price", "Margin"];

let fullData = [];
let filteredData = [];
let displayedColumns = [];
let baselineData = [];
const listCache = {}; // cache for List/Record + multiple-select feeds

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

function renderSortBar(columns, parentContainer) {
  const sortContainer = document.createElement("div");
  sortContainer.id = "sort-bar";
  sortContainer.style.display = "none";
  sortContainer.style.alignItems = "center";
  sortContainer.style.gap = "0.5rem";
  sortContainer.style.margin = "1rem 0";
  sortContainer.style.padding = "0.5rem";
  sortContainer.style.background = "#f7f7f7";
  sortContainer.style.border = "1px solid #ddd";
  sortContainer.style.borderRadius = "6px";

  const label = document.createElement("strong");
  label.textContent = "Sort By:";
  sortContainer.appendChild(label);

  const fieldSelect = document.createElement("select");
  fieldSelect.id = "sort-field-select";
  fieldSelect.classList.add("theme-select");

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

  sortContainer.appendChild(fieldSelect);

  const orderSelect = document.createElement("select");
  orderSelect.id = "sort-order-select";
  orderSelect.classList.add("theme-select");
  sortContainer.appendChild(orderSelect);

  fieldSelect.addEventListener("change", () => {
    const selected = fieldSelect.value;
    orderSelect.innerHTML = "";

    if (!selected) return;

    const field = fieldMap.find((f) => f.name === selected);
    const type = field?.fieldType || "Free-Form Text";

    const TEXT_TYPES = ["Free-Form Text", "List/Record", "multiple-select", "rich-text", "Link", "image"];
    const NUM_TYPES = ["Currency", "Integer", "Decimal", "Percent", "Float", "Number"];
    const CHECK_TYPES = ["Checkbox"];

    if (TEXT_TYPES.includes(type)) {
      orderSelect.appendChild(new Option("A → Z", "asc"));
      orderSelect.appendChild(new Option("Z → A", "desc"));
    } else if (NUM_TYPES.includes(type)) {
      orderSelect.appendChild(new Option("Ascending", "asc"));
      orderSelect.appendChild(new Option("Descending", "desc"));
    } else if (CHECK_TYPES.includes(type)) {
      orderSelect.appendChild(new Option("Checked First", "checked"));
      orderSelect.appendChild(new Option("Unchecked First", "unchecked"));
    } else {
      orderSelect.appendChild(new Option("A → Z", "asc"));
      orderSelect.appendChild(new Option("Z → A", "desc"));
    }
  });

  const applyBtn = document.createElement("button");
  applyBtn.textContent = "Apply";
  applyBtn.style.padding = "0.4rem 0.8rem";
  applyBtn.style.border = "none";
  applyBtn.style.borderRadius = "4px";
  applyBtn.style.cursor = "pointer";

  applyBtn.addEventListener("click", () => {
    const field = fieldSelect.value;
    const order = orderSelect.value;

    if (!field || !order) {
      alert("Select both a field and sort order.");
      return;
    }

    if (filteredData.length > 2500) {
      alert("Sorting disabled until filters reduce the dataset.");
      return;
    }

    applySort(field, order);
  });

  sortContainer.appendChild(applyBtn);
  parentContainer.appendChild(sortContainer);
}

// --- LOAD DATA ---
async function loadJSONData() {
  const container = document.getElementById("table-data");

  const spinnerContainer = document.createElement("div");
  spinnerContainer.classList.add("loading-container");
  const spinnerMsg = document.createElement("p");
  spinnerMsg.textContent = "Loading data, please wait...";
  spinnerContainer.innerHTML = `<div class="spinner"></div>`;
  spinnerContainer.appendChild(spinnerMsg);
  container.appendChild(spinnerContainer);

  try {
    const response = await fetch(jsonUrl);
    if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);

    fullData = await response.json();

    // Apply tool columns
    if (typeof window.addRetailPriceTool === "function")
      fullData = window.addRetailPriceTool(fullData);
    if (typeof window.addMarginTool === "function")
      fullData = window.addMarginTool(fullData);

    // --- Preload List/Record + multiple-select feeds
    const preloadPromises = fieldMap
      .filter((f) => (f.fieldType === "List/Record" || f.fieldType === "multiple-select") && f.jsonFeed)
      .map(async (f) => {
        try {
          const res = await fetch(f.jsonFeed);
          if (!res.ok) throw new Error(`Feed ${f.name} failed`);
          const data = await res.json();
          listCache[f.name] = data;
        } catch (err) {
          console.warn(`⚠️ Failed to preload options for ${f.name}:`, err);
          listCache[f.name] = [];
        }
      });

    await Promise.all(preloadPromises);

    // --- Normalize multiple-selects into arrays + rebuild internal IDs
    fullData = fullData.map((row) => {
      fieldMap.forEach((f) => {
        if (f.fieldType === "multiple-select") {
          const val = row[f.name];

          if (typeof val === "string") {
            row[f.name] = val.split(",").map((s) => s.trim()).filter(Boolean);
          } else if (!Array.isArray(val)) {
            row[f.name] = [];
          }

          const opts = listCache[f.name] || [];
          row[`${f.name}_InternalId`] = row[f.name].map((name) => {
            const match = opts.find((o) =>
              (o["Name"] || o.name || "").toLowerCase() === String(name).toLowerCase()
            );
            return match ? String(match["Internal ID"] || match.id) : null;
          }).filter(Boolean);

          if (row[f.name].length !== row[`${f.name}_InternalId`].length) {
            console.warn(`[LOAD][${f.name}] Some names could not be mapped to IDs`, {
              names: row[f.name],
              ids: row[`${f.name}_InternalId`]
            });
          }
        }
      });
      return row;
    });

    filteredData = [...fullData];
    baselineData = JSON.parse(JSON.stringify(fullData));

    const columns = Object.keys(fullData[0] || {});
    displayedColumns = [
      ...columns.slice(0, 7),
      ...toolColumns.filter((tc) => !columns.slice(0, 7).includes(tc)),
    ];

    const panelsParent = document.createElement("div");
    panelsParent.classList.add("panel-parent", "is-hidden");
    container.appendChild(panelsParent);

    await renderFilterPanel(columns, panelsParent);
    renderFieldsPanel(columns, panelsParent);
    renderBulkActionPanel(columns, panelsParent);
    renderUpdateButton(panelsParent);
    renderPushButton(panelsParent);
    renderHistoricalPricingButton(panelsParent);
    renderSortBar(columns, container);

    await displayJSONTable(filteredData);

    panelsParent.classList.remove("is-hidden");

    spinnerContainer.style.opacity = "1";
    spinnerContainer.style.transition = "opacity 0.5s ease";
    requestAnimationFrame(() => {
      spinnerContainer.style.opacity = "0";
    });
    setTimeout(() => spinnerContainer.remove(), 600);

    document.querySelectorAll(".filter-panel")
      .forEach((panel) => panel.classList.add("collapsed"));
    document.querySelectorAll(".filter-panel-header")
      .forEach((header) => header.classList.add("collapsed"));

    window.filteredData = filteredData;
    window.fullData = fullData;
  } catch (error) {
    console.error("Error loading data:", error);
    spinnerMsg.textContent = "❌ Failed to load JSON data.";
  }
}

function renderHistoricalPricingButton(parent) {
  const btn = document.createElement("button");
  btn.textContent = "Historical Pricing";
  btn.style.padding = "0.5rem 1rem";
  btn.style.border = "none";
  btn.style.borderRadius = "4px";
  btn.style.cursor = "pointer";

  btn.addEventListener("click", () => {
    if (window.filteredData && window.filteredData.length > 0) {
      openHistoricalPricingModal(window.filteredData);
    } else {
      alert("No product data available to export.");
    }
  });

  parent.appendChild(btn);
}

// --- FILTER PANEL ---
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

  const addBtn = document.createElement("button");
  addBtn.textContent = "Add Filter";
  addBtn.type = "button";
  addBtn.style.marginTop = "0.5rem";

  const addFilterRow = async (prefill = {}) => {
    const row = document.createElement("tr");

    const fieldTd = document.createElement("td");
    fieldTd.style.padding = "0.25rem 0.5rem";
    const fieldSelect = document.createElement("select");
    fieldSelect.classList.add("theme-select", "filter-field-select");

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

      } else if (field && field.fieldType === "multiple-select") {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.classList.add("filter-multi-btn");
        btn.textContent = "Select";
        btn.dataset.field = selectedFieldName;
        btn.dataset.names = btn.dataset.names || "[]";
        btn.dataset.ids = btn.dataset.ids || "[]";

        const preview = document.createElement("span");
        preview.classList.add("filter-multi-preview");
        preview.style.marginLeft = "8px";
        preview.style.fontStyle = "italic";

        const renderPreview = () => {
          let names = [];
          try { names = JSON.parse(btn.dataset.names || "[]"); } catch { names = []; }
          preview.textContent = names.length ? names.join(", ") : "(no values selected)";
          btn.textContent = names.length ? `Select (${names.length})` : "Select";
        };

        btn.addEventListener("click", async () => {
          const modal = document.getElementById("multi-select-modal");
          if (!modal) {
            alert("Multi-select modal not found. (It is created when the table is rendered.)");
            return;
          }

          const modalTitle = modal.querySelector("#multi-select-title");
          const modalSearch = modal.querySelector("#multi-search");
          const modalOptions = modal.querySelector(".multi-select-options");
          const modalSave = modal.querySelector("#multi-save");
          const modalCancel = modal.querySelector("#multi-cancel");

          modal.classList.remove("hidden");
          modalOptions.innerHTML = "";
          modalSearch.value = "";

          const options = await getListOptions(field);

          let selectedIds = [];
          try { selectedIds = JSON.parse(btn.dataset.ids || "[]").map(String); } catch { selectedIds = []; }

          const normalizeName = (str) =>
            (str || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

          const stripPrefix = (str) => {
            const parts = String(str || "").split(":");
            return parts.length > 1 ? parts[parts.length - 1].trim() : String(str || "");
          };

          const renderList = (term = "") => {
            modalOptions.innerHTML = "";
            const lc = term.toLowerCase().trim();

            const filtered = options.filter(o =>
              ((o["Name"] || o.name || "")).toLowerCase().includes(lc)
            );

            const set = new Set(selectedIds.map(String));
            const ordered = [
              ...filtered.filter(o => set.has(String(o["Internal ID"] || o.id))),
              ...filtered.filter(o => !set.has(String(o["Internal ID"] || o.id))),
            ];

            ordered.forEach(opt => {
              const optId = String(opt["Internal ID"] || opt.id);
              const optName = (opt["Name"] || opt.name || "");

              const label = document.createElement("label");
              label.style.display = "flex";
              label.style.alignItems = "center";
              label.style.gap = "6px";

              const cb = document.createElement("input");
              cb.type = "checkbox";
              cb.value = optId;
              cb.checked = set.has(optId);

              cb.addEventListener("change", () => {
                if (cb.checked) {
                  if (!selectedIds.includes(optId)) selectedIds.push(optId);
                } else {
                  selectedIds = selectedIds.filter(x => x !== optId);
                }
                if (modalTitle) modalTitle.textContent = `Filter: ${selectedFieldName} (${selectedIds.length} selected)`;
              });

              label.appendChild(cb);
              label.appendChild(document.createTextNode(optName));
              modalOptions.appendChild(label);
            });

            if (modalTitle) modalTitle.textContent = `Filter: ${selectedFieldName} (${selectedIds.length} selected)`;
          };

          renderList();
          modalSearch.oninput = () => renderList(modalSearch.value);

          modalCancel.onclick = () => {
            modal.classList.add("hidden");
          };

          modalSave.onclick = () => {
            const ids = selectedIds.map(String);

            const names = ids.map(id => {
              const match = options.find(o => String(o["Internal ID"] || o.id) === id);
              return match ? (match["Name"] || match.name || "") : "";
            }).filter(Boolean);

            const seen = new Set();
            const dedupedNames = [];
            names.forEach(n => {
              const key1 = normalizeName(n);
              const key2 = normalizeName(stripPrefix(n));
              const key = key2 && key2 !== key1 ? `${key1}|${key2}` : key1;
              if (!seen.has(key)) {
                seen.add(key);
                dedupedNames.push(n);
              }
            });

            btn.dataset.ids = JSON.stringify(ids);
            btn.dataset.names = JSON.stringify(dedupedNames);

            renderPreview();
            modal.classList.add("hidden");
          };
        });

        renderPreview();
        valueTd.appendChild(btn);
        valueTd.appendChild(preview);

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
    const field = fieldMap.find((f) => f.name === col);
    if (field && field.disableField) return;

    const option = document.createElement("option");
    option.value = col;
    option.textContent = col;
    columnSelect.appendChild(option);
  });

  const valueInput = document.createElement("input");
  valueInput.type = "number";
  valueInput.id = "bulk-value-input";
  valueInput.placeholder = "Enter value";

  const textInput = document.createElement("input");
  textInput.type = "text";
  textInput.id = "bulk-text-input";
  textInput.placeholder = "Enter text";
  textInput.style.display = "none";

  const valueSelect = document.createElement("select");
  valueSelect.id = "bulk-value-select";
  valueSelect.classList.add("theme-select");
  valueSelect.style.display = "none";

  const valueSearch = document.createElement("input");
  valueSearch.type = "text";
  valueSearch.id = "bulk-value-search";
  valueSearch.placeholder = "Search options…";
  valueSearch.style.display = "none";
  valueSearch.style.marginBottom = "4px";

  const actionSelect = document.createElement("select");
  actionSelect.id = "bulk-action-select";
  ["Set To", "Add By Value", "Add By Percent"].forEach((action) => {
    const option = document.createElement("option");
    option.value = action;
    option.textContent = action;
    actionSelect.appendChild(option);
  });

  const dynamicControls = document.createElement("div");
  dynamicControls.id = "bulk-dynamic-controls";
  dynamicControls.style.marginTop = "6px";

  const bulkCheckbox = document.createElement("input");
  bulkCheckbox.type = "checkbox";
  bulkCheckbox.id = "bulk-checkbox";
  bulkCheckbox.style.display = "none";

  const bulkCheckboxLabel = document.createElement("label");
  bulkCheckboxLabel.textContent = "Set checked?";
  bulkCheckboxLabel.style.marginLeft = "6px";
  bulkCheckboxLabel.style.display = "none";

  const applyBtn = document.createElement("button");
  applyBtn.textContent = "Apply";

  bulkPanel.appendChild(columnSelect);
  bulkPanel.appendChild(valueSearch);
  bulkPanel.appendChild(valueInput);
  bulkPanel.appendChild(textInput);
  bulkPanel.appendChild(valueSelect);
  bulkPanel.appendChild(actionSelect);
  bulkPanel.appendChild(dynamicControls);
  bulkPanel.appendChild(bulkCheckbox);
  bulkPanel.appendChild(bulkCheckboxLabel);
  bulkPanel.appendChild(applyBtn);

  panelContainer.appendChild(bulkPanel);
  parent.appendChild(panelContainer);

  panelHeader.addEventListener("click", () => {
    bulkPanel.classList.toggle("collapsed");
    panelHeader.classList.toggle("collapsed");
  });

  let bulkModal = document.getElementById("bulk-multi-modal");
  if (!bulkModal) {
    bulkModal = document.createElement("div");
    bulkModal.id = "bulk-multi-modal";
    bulkModal.className = "multi-select-modal hidden";
    bulkModal.innerHTML = `
      <div class="multi-select-content">
        <h3 id="bulk-multi-title">Choose Values</h3>
        <div class="multi-select-search">
          <input type="text" id="bulk-multi-search" placeholder="Search options...">
        </div>
        <div class="multi-select-options"></div>
        <div class="multi-select-actions">
          <button id="bulk-multi-cancel">Cancel</button>
          <button id="bulk-multi-save">Use Selected</button>
        </div>
      </div>
    `;
    document.body.appendChild(bulkModal);
  }

  const bulkTitle = bulkModal.querySelector("#bulk-multi-title");
  const bulkSearch = bulkModal.querySelector("#bulk-multi-search");
  const bulkOptions = bulkModal.querySelector(".multi-select-options");
  const bulkSave = bulkModal.querySelector("#bulk-multi-save");
  const bulkCancel = bulkModal.querySelector("#bulk-multi-cancel");

  let bulkSelectedIds = [];
  let bulkSelectedNames = [];
  let bulkOptionsCache = [];

  const restoreSelections = (checkedRowIndices, allChecked) => {
    const newRows = document.querySelectorAll("table.csv-table tr");
    newRows.forEach((row, index) => {
      if (index === 0) return;
      const cb = row.querySelector("td input[type='checkbox'].row-selector");
      if (cb && checkedRowIndices.has(index - 1)) {
        cb.checked = true;
        row.classList.add("selected");
      }
    });
    const selectAll = document.querySelector('input[type="checkbox"].select-all');
    if (selectAll && allChecked) selectAll.checked = true;
  };

  columnSelect.addEventListener("change", async () => {
    const col = columnSelect.value;
    const field = fieldMap.find((f) => f.name === col);
    dynamicControls.innerHTML = "";

    valueInput.style.display = "inline-block";
    valueInput.type = "number";
    textInput.style.display = "none";
    actionSelect.style.display = "inline-block";
    valueSearch.style.display = "none";
    valueSelect.style.display = "none";
    bulkCheckbox.style.display = "none";
    bulkCheckboxLabel.style.display = "none";

    if (field && field.fieldType === "List/Record") {
      valueInput.style.display = "none";
      textInput.style.display = "none";
      actionSelect.style.display = "none";
      valueSearch.style.display = "none";
      valueSelect.style.display = "inline-block";

      const options = await getListOptions(field);
      valueSelect.innerHTML = "";
      options.forEach((opt) => {
        const option = document.createElement("option");
        option.value = String(opt["Internal ID"] || opt.id);
        option.textContent = opt["Name"] || opt.name;
        valueSelect.appendChild(option);
      });

      applyBtn.onclick = async () => {
        applyBulkAction(col, valueSelect.value, "Set List Value");
        await new Promise((r) => setTimeout(r, 100));
        applyFilters();
      };
      return;
    }

    if (field && field.fieldType === "Checkbox") {
      valueInput.style.display = "none";
      textInput.style.display = "none";
      actionSelect.style.display = "none";
      valueSelect.style.display = "none";
      bulkCheckbox.style.display = "inline-block";
      bulkCheckboxLabel.style.display = "inline-block";

      applyBtn.onclick = async () => {
        const isChecked = bulkCheckbox.checked;
        const table = document.querySelector("table.csv-table");
        if (!table) return;

        const checkedRowIndices = new Set();
        table.querySelectorAll("tr").forEach((row, index) => {
          if (index === 0) return;
          const cb = row.querySelector("td input[type='checkbox'].row-selector");
          if (cb && cb.checked) checkedRowIndices.add(index - 1);
        });

        checkedRowIndices.forEach((rowIndex) => {
          filteredData[rowIndex][col] = isChecked;
        });

        await displayJSONTable(filteredData, { showAll: true });
        applyFilters();
      };
      return;
    }

    if (field && field.fieldType === "Free-Form Text") {
      valueInput.style.display = "none";
      textInput.style.display = "inline-block";
      actionSelect.style.display = "none";
      valueSelect.style.display = "none";

      applyBtn.onclick = async () => {
        const newText = textInput.value || "";
        const table = document.querySelector("table.csv-table");
        if (!table) return;

        const checkedRowIndices = new Set();
        table.querySelectorAll("tr").forEach((row, index) => {
          if (index === 0) return;
          const cb = row.querySelector("td input[type='checkbox'].row-selector");
          if (cb && cb.checked) checkedRowIndices.add(index - 1);
        });

        checkedRowIndices.forEach((rowIndex) => {
          filteredData[rowIndex][col] = newText;
        });

        await displayJSONTable(filteredData, { showAll: true });
        applyFilters();
      };
      return;
    }

    if (field && field.fieldType === "multiple-select") {
      actionSelect.innerHTML = "";
      ["Replace", "Append", "Remove"].forEach((mode) => {
        const opt = document.createElement("option");
        opt.value = mode;
        opt.textContent = mode;
        actionSelect.appendChild(opt);
      });

      valueInput.style.display = "none";
      textInput.style.display = "none";
      valueSelect.style.display = "none";
      valueSearch.style.display = "none";

      const preview = document.createElement("span");
      preview.id = "bulk-multi-preview";
      preview.style.marginLeft = "8px";
      preview.style.fontStyle = "italic";
      preview.textContent = "(no values chosen)";

      const chooseBtn = document.createElement("button");
      chooseBtn.textContent = "Choose values…";
      chooseBtn.style.marginLeft = "8px";

      dynamicControls.appendChild(chooseBtn);
      dynamicControls.appendChild(preview);

      bulkOptionsCache = await getListOptions(field);

      const normalizeName = (str) =>
        (str || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

      const stripPrefix = (str) => {
        const parts = String(str || "").split(":");
        return parts.length > 1 ? parts[parts.length - 1].trim() : String(str || "");
      };

      const candidatesFor = (label) => {
        const full = normalizeName(label);
        const child = normalizeName(stripPrefix(label));
        return child && child !== full ? [full, child] : [full];
      };

      const idForName = (name) => {
        const norm = normalizeName(name);
        const match = bulkOptionsCache.find(
          (o) =>
            normalizeName(o["Name"] || o.name) === norm ||
            normalizeName(stripPrefix(o["Name"] || o.name)) === norm
        );
        return match ? String(match["Internal ID"] || match.id) : null;
      };

      const rebuildIdsFromNames = (namesArr) => {
        return (namesArr || [])
          .map((nm) => idForName(nm))
          .filter(Boolean)
          .map(String);
      };

      const openBulkModal = () => {
        bulkModal.classList.remove("hidden");
        bulkTitle.textContent = `Choose values for ${col}`;
        bulkOptions.innerHTML = "";
        bulkSearch.value = "";

        const renderBulkList = (filter = "") => {
          bulkOptions.innerHTML = "";
          const filtered = bulkOptionsCache.filter(o =>
            (o["Name"] || o.name || "").toLowerCase().includes(filter.toLowerCase())
          );

          const selectedSet = new Set(bulkSelectedIds.map(String));
          const ordered = [
            ...filtered.filter(o => selectedSet.has(String(o["Internal ID"] || o.id))),
            ...filtered.filter(o => !selectedSet.has(String(o["Internal ID"] || o.id))),
          ];

          ordered.forEach(opt => {
            const label = document.createElement("label");
            label.style.display = "flex";
            label.style.alignItems = "center";
            label.style.gap = "6px";

            const cb = document.createElement("input");
            cb.type = "checkbox";
            cb.value = String(opt["Internal ID"] || opt.id);
            cb.checked = selectedSet.has(cb.value);

            cb.addEventListener("change", () => {
              const id = cb.value;
              const name = opt["Name"] || opt.name || "";
              if (cb.checked) {
                if (!bulkSelectedIds.includes(id)) {
                  bulkSelectedIds.push(id);
                  bulkSelectedNames.push(name);
                }
              } else {
                const i = bulkSelectedIds.indexOf(id);
                if (i > -1) {
                  bulkSelectedIds.splice(i, 1);
                  bulkSelectedNames.splice(i, 1);
                }
              }
            });

            label.appendChild(cb);
            label.appendChild(document.createTextNode((opt["Name"] || opt.name) ?? ""));
            bulkOptions.appendChild(label);
          });
        };

        renderBulkList();
        bulkSearch.oninput = () => renderBulkList(bulkSearch.value);

        bulkSave.onclick = () => {
          preview.textContent = bulkSelectedNames.length
            ? `${bulkSelectedNames.join(", ")}`
            : "(no values chosen)";
          bulkModal.classList.add("hidden");
        };

        bulkCancel.onclick = () => {
          bulkModal.classList.add("hidden");
        };
      };

      chooseBtn.onclick = () => {
        bulkSelectedIds = [];
        bulkSelectedNames = [];
        openBulkModal();
      };

      applyBtn.onclick = () => {
        const mode = actionSelect.value;
        if (!bulkSelectedIds || bulkSelectedIds.length === 0) {
          alert("Choose one or more values first.");
          return;
        }

        const table = document.querySelector("table.csv-table");
        if (!table) return;

        const checkedRowIndices = new Set();
        const allRowCbs = table.querySelectorAll('tr input[type="checkbox"].row-selector');
        const allChecked = [...allRowCbs].every(cb => cb.checked);

        table.querySelectorAll("tr").forEach((row, index) => {
          if (index === 0) return;
          const checkbox = row.querySelector("td input[type='checkbox'].row-selector");
          if (checkbox && checkbox.checked) checkedRowIndices.add(index - 1);
        });

        checkedRowIndices.forEach((rowIndex) => {
          let ids = Array.isArray(filteredData[rowIndex][`${col}_InternalId`])
            ? [...filteredData[rowIndex][`${col}_InternalId`].map(String)]
            : [];
          let names = Array.isArray(filteredData[rowIndex][col])
            ? [...filteredData[rowIndex][col]]
            : [];

          if (mode === "Replace") {
            ids = bulkSelectedIds.map(String);
            names = [...bulkSelectedNames];

          } else if (mode === "Append") {
            bulkSelectedIds.forEach((id, idx) => {
              const strId = String(id);
              const nameToAdd = bulkSelectedNames[idx];
              const alreadyHasId = ids.includes(strId);
              const alreadyHasName = names.some(
                n => normalizeName(n) === normalizeName(nameToAdd) ||
                     normalizeName(n) === normalizeName(stripPrefix(nameToAdd))
              );
              if (!alreadyHasId && !alreadyHasName) {
                ids.push(strId);
                names.push(nameToAdd);
              }
            });

          } else if (mode === "Remove") {
            const targetNorms = new Set();
            bulkSelectedNames.forEach((optName) => {
              candidatesFor(optName).forEach((c) => targetNorms.add(c));
            });

            bulkSelectedIds.forEach((id) => {
              const strId = String(id);
              const idIdx = ids.findIndex(existingId => String(existingId) === strId);
              if (idIdx > -1) ids.splice(idIdx, 1);
            });

            const nameNorms = names.map((n) => normalizeName(n));
            for (let i = names.length - 1; i >= 0; i--) {
              const nFull = nameNorms[i];
              const nChild = normalizeName(stripPrefix(names[i]));
              if (targetNorms.has(nFull) || targetNorms.has(nChild)) {
                names.splice(i, 1);
              }
            }

            ids = rebuildIdsFromNames(names);
          }

          filteredData[rowIndex][`${col}_InternalId`] = ids;
          filteredData[rowIndex][col] = names;
        });

        displayJSONTable(filteredData).then(() => restoreSelections(checkedRowIndices, allChecked));
      };

      return;
    }

    actionSelect.innerHTML = "";
    ["Set To", "Add By Value", "Add By Percent"].forEach((action) => {
      const option = document.createElement("option");
      option.value = action;
      option.textContent = action;
      actionSelect.appendChild(option);
    });

    valueInput.style.display = "inline-block";
    actionSelect.style.display = "inline-block";
    valueSearch.style.display = "none";
    valueSelect.style.display = "none";

    applyBtn.onclick = async () => {
      applyBulkAction(col, valueInput.value, actionSelect.value);
      await new Promise((r) => setTimeout(r, 100));
      applyFilters();
    };
  });

  columnSelect.dispatchEvent(new Event("change"));
}

// --- UPDATE BUTTON ---
function renderUpdateButton(parent) {
  const updateBtn = document.createElement("button");
  updateBtn.textContent = "Update";
  updateBtn.style.padding = "0.5rem 1rem";
  updateBtn.style.border = "none";
  updateBtn.style.borderRadius = "4px";
  updateBtn.style.cursor = "pointer";
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

  const checkedRowIndices = new Set();
  const allRowCbs = table.querySelectorAll('tr input[type="checkbox"].row-selector');
  const allChecked = [...allRowCbs].every(cb => cb.checked);

  table.querySelectorAll("tr").forEach((row, index) => {
    if (index === 0) return;
    const checkbox = row.querySelector('td input[type="checkbox"].row-selector');
    if (checkbox && checkbox.checked) checkedRowIndices.add(index - 1);
  });

  const KEY_FIELDS = ["Purchase Price", "Base Price", "Retail Price", "Margin"];
  const isKeyField = KEY_FIELDS.includes(column);

  const isSetTo =
    action === "Set To" ||
    action === "Set" ||
    action === "Set Value" ||
    action === "Overwrite";

  checkedRowIndices.forEach((rowIndex) => {
    let rowData = { ...filteredData[rowIndex] };
    const field = fieldMap.find((f) => f.name === column);

    if (action === "Set List Value") {
      const options = (listCache[field?.name] || []);
      const selected = options.find((o) => String(o["Internal ID"] || o.id) === String(value));
      rowData[column] = selected ? (selected["Name"] || selected.name || "") : "";
      rowData[`${column}_InternalId`] = value;

    } else if (field && field.fieldType === "Free-Form Text") {
      if (isSetTo) rowData[column] = value;

    } else {
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
        return;
      }
    }

    if (isKeyField && typeof window.recalcRow === "function") {
      rowData = window.recalcRow(rowData, column);
    }

    filteredData[rowIndex] = rowData;
    if (Array.isArray(baselineData)) baselineData[rowIndex] = { ...rowData };

    const internalId = rowData["Internal ID"];
    if (internalId != null) {
      const fullIdx = fullData.findIndex(
        (r) => String(r["Internal ID"]) === String(internalId)
      );
      if (fullIdx > -1) {
        fullData[fullIdx] = { ...fullData[fullIdx], ...rowData };
      }
    }
  });

  displayJSONTable(filteredData, { showAll: true }).then(() => {
    const newRows = document.querySelectorAll("table.csv-table tr");
    newRows.forEach((row, index) => {
      if (index === 0) return;
      const cb = row.querySelector('td input[type="checkbox"].row-selector');
      if (cb && checkedRowIndices.has(index - 1)) {
        cb.checked = true;
        row.classList.add("selected");
      }
    });

    const selectAll = document.querySelector('input[type="checkbox"].select-all');
    if (selectAll && allChecked) selectAll.checked = true;
  });
}

// --- HELPER FUNCTIONS ---
function applySort(field, order) {
  const fieldMeta = fieldMap.find(f => f.name === field);
  const type = fieldMeta?.fieldType || "Free-Form Text";

  const getValue = row => {
    const v = row[field];

    if (v == null) return "";

    if (type === "Checkbox") {
      return (v === true || v === "true" || v === 1) ? 1 : 0;
    }

    if (type === "Currency" || type === "Integer" || type === "Decimal" || type === "Percent") {
      const num = parseFloat(v);
      return isNaN(num) ? 0 : num;
    }

    if (type === "multiple-select") {
      return Array.isArray(v) ? v.join(", ").toLowerCase() : String(v).toLowerCase();
    }

    return String(v).toLowerCase();
  };

  filteredData.sort((a, b) => {
    const A = getValue(a);
    const B = getValue(b);

    if (order === "checked") return B - A;
    if (order === "unchecked") return A - B;
    if (order === "asc") return A > B ? 1 : A < B ? -1 : 0;
    if (order === "desc") return A < B ? 1 : A > B ? -1 : 0;
    return 0;
  });

  displayJSONTable(filteredData, { showAll: true });
}

function updateDisplayedColumns() {
  const checkedBoxes = document.querySelectorAll(
    "#fields-panel input[type='checkbox']:checked"
  );
  displayedColumns = Array.from(checkedBoxes).map((cb) => cb.dataset.column);
}

// --- APPLY FILTERS ---
function applyFilters() {
  const tbody = document.querySelector("#filter-tbody");

  if (!tbody) {
    filteredData = [...fullData];
    window.filteredData = filteredData;

    const sortBar = document.getElementById("sort-bar");
    if (sortBar) sortBar.style.display = "none";

    displayJSONTable(filteredData, { showAll: false });
    return;
  }

  const rules = [];
  Array.from(tbody.querySelectorAll("tr")).forEach((tr) => {
    const fieldSelect = tr.querySelector("select.filter-field-select");
    if (!fieldSelect) return;

    const fieldName = fieldSelect.value;
    if (!fieldName) return;

    const fm = fieldMap.find((f) => f.name === fieldName);

    if (fm && fm.fieldType === "multiple-select") {
      const btn = tr.querySelector("button.filter-multi-btn");
      if (!btn) return;

      let values = [];
      try { values = JSON.parse(btn.dataset.names || "[]"); } catch { values = []; }
      values = Array.isArray(values) ? values.filter(Boolean) : [];

      if (!values.length) return;

      rules.push({ field: fieldName, isMulti: true, values });
      return;
    }

    const valueSelect = tr.querySelector("select.filter-value-select");
    const valueInput = tr.querySelector("input.filter-value-input");

    let value = "";
    if (valueSelect) value = valueSelect.value?.trim() ?? "";
    else if (valueInput) value = valueInput.value?.trim() ?? "";

    if (!value) return;

    const isListRecord = fm && fm.fieldType === "List/Record";
    const isCheckbox = fm && fm.fieldType === "Checkbox";

    rules.push({ field: fieldName, isMulti: false, isListRecord, isCheckbox, value });
  });

  const sortBar = document.getElementById("sort-bar");

  if (rules.length === 0) {
    filteredData = [...fullData];
    window.filteredData = filteredData;

    if (sortBar) sortBar.style.display = "none";

    displayJSONTable(filteredData, { showAll: false });
    return;
  }

  const normalize = (s) =>
    String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  const stripPrefix = (s) => {
    const parts = String(s || "").split(":");
    return parts.length > 1 ? parts[parts.length - 1].trim() : String(s || "");
  };

  filteredData = fullData.filter((row) =>
    rules.every((r) => {
      if (r.isMulti) {
        const arr = Array.isArray(row[r.field]) ? row[r.field] : [];
        if (!arr.length) return false;

        const rowNorms = new Set(arr.flatMap(v => [normalize(v), normalize(stripPrefix(v))]));

        return r.values.some(v =>
          rowNorms.has(normalize(v)) || rowNorms.has(normalize(stripPrefix(v)))
        );
      }

      if (r.isCheckbox) {
        const want = String(r.value).toLowerCase() === "true";
        const got =
          row[r.field] === true ||
          row[r.field] === 1 ||
          ["true", "t", "1", "y", "yes"].includes(String(row[r.field] || "").trim().toLowerCase());
        return got === want;
      }

      const cell = row[r.field] != null ? String(row[r.field]) : "";
      if (r.isListRecord) return cell === r.value;
      return cell.toLowerCase().includes(String(r.value).toLowerCase());
    })
  );

  if (sortBar) sortBar.style.display = "flex";
  displayJSONTable(filteredData, { showAll: true });
}

// --- TABLE RENDER ---
async function displayJSONTable(data, opts = { showBusy: false }) {
  const container = document.getElementById("table-data");

  container.querySelectorAll("table.csv-table, p.no-data").forEach((el) => el.remove());

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

    const listCols = displayedColumns
      .map((name) => fieldMap.find((f) => f.name === name))
      .filter((f) => f && (f.fieldType === "List/Record" || f.fieldType === "multiple-select"));

    const optionsByFieldName = {};
    await Promise.all(
      listCols.map(async (field) => {
        optionsByFieldName[field.name] = await getListOptions(field);
      })
    );

    const table = document.createElement("table");
    table.classList.add("csv-table", "fade-in");
    table.style.tableLayout = "fixed";

    const colgroup = document.createElement("colgroup");
    for (let i = 0; i < displayedColumns.length + 1; i++) {
      const col = document.createElement("col");
      col.style.width = i === 0 ? "40px" : "150px";
      colgroup.appendChild(col);
    }
    table.appendChild(colgroup);

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");

    const selectAllTh = document.createElement("th");
    const selectAllCheckbox = document.createElement("input");
    selectAllCheckbox.type = "checkbox";
    selectAllTh.appendChild(selectAllCheckbox);
    headerRow.appendChild(selectAllTh);

    displayedColumns.forEach((col, i) => {
      const th = document.createElement("th");
      th.textContent = col;
      if (toolColumns.includes(col)) th.classList.add("tool-column-header");

      const resizer = document.createElement("div");
      resizer.className = "resize-handle";
      th.appendChild(resizer);

      let startX, startWidth;
      resizer.addEventListener("mousedown", (e) => {
        e.preventDefault();
        startX = e.pageX;
        startWidth = colgroup.children[i + 1].offsetWidth;

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

    selectAllCheckbox.addEventListener("change", () => {
      const rowCheckboxes = table.querySelectorAll("td input[type='checkbox'].row-selector");
      rowCheckboxes.forEach((cb) => {
        cb.checked = selectAllCheckbox.checked;
        highlightRow(cb);
      });
    });

    const tbody = document.createElement("tbody");
    const rows = opts.showAll ? data : data.slice(0, MAX_ROWS);

    const renderLinkValue = (raw) => {
      if (typeof raw !== "string") return null;
      if (!/<a\s+[^>]*href=/i.test(raw)) return null;

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

    let modal = document.getElementById("multi-select-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "multi-select-modal";
      modal.className = "multi-select-modal hidden";
      modal.innerHTML = `
        <div class="multi-select-content">
          <h3 id="multi-select-title">Edit Selections</h3>
          <div class="multi-select-search">
            <input type="text" id="multi-search" placeholder="Search options...">
          </div>
          <div class="multi-select-options"></div>
          <div class="multi-select-actions">
            <button id="multi-cancel">Cancel</button>
            <button id="multi-save">Save</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }
    const modalTitle = modal.querySelector("#multi-select-title");
    const modalSearch = modal.querySelector("#multi-search");
    const modalOptions = modal.querySelector(".multi-select-options");
    const modalSave = modal.querySelector("#multi-save");
    const modalCancel = modal.querySelector("#multi-cancel");

    for (let r = 0; r < rows.length; r++) {
      const rowData = rows[r];
      const row = document.createElement("tr");
      row.dataset.index = String(r);

      const checkboxTd = document.createElement("td");
      const rowCheckbox = document.createElement("input");
      rowCheckbox.type = "checkbox";
      rowCheckbox.classList.add("row-selector");
      rowCheckbox.addEventListener("change", () => highlightRow(rowCheckbox));
      checkboxTd.appendChild(rowCheckbox);
      row.appendChild(checkboxTd);

      for (const col of displayedColumns) {
        const td = document.createElement("td");
        const field = fieldMap.find((f) => f.name === col);
        const rawVal = rowData[col];

        if (field && field.fieldType === "List/Record") {
          const select = document.createElement("select");
          select.classList.add("theme-select");
          if (field.name === "Class") select.style.maxWidth = "180px";

          const options = optionsByFieldName[field.name] || [];
          for (const opt of options) {
            const option = document.createElement("option");
            option.value = String(opt["Internal ID"] || opt.id);
            option.textContent = opt["Name"] || opt.name;
            if (rowData[col] === (opt["Name"] || opt.name)) option.selected = true;
            select.appendChild(option);
          }

          select.addEventListener("change", () => {
            const selected = (optionsByFieldName[field.name] || []).find(
              (o) => String(o["Internal ID"] || o.id) === String(select.value)
            );
            rowData[col] = selected ? (selected["Name"] || selected.name || "") : "";
            rowData[`${col}_InternalId`] = select.value;
            rowCheckbox.checked = true;
            highlightRow(rowCheckbox);
          });

          td.appendChild(select);

        } else if (field && field.fieldType === "multiple-select") {
          const preview = document.createElement("span");
          preview.className = "multi-select-preview";

          const namesArr = Array.isArray(rowData[col])
            ? rowData[col]
            : (Array.isArray(rawVal)
                ? rawVal
                : (typeof rawVal === "string"
                    ? rawVal.split(",").map((s) => s.trim()).filter(Boolean)
                    : []));

          const isFabricColours = col === "Fabric / Colours";
          preview.textContent = isFabricColours
            ? (namesArr.length ? "✅" : "")
            : namesArr.join(", ");

          const idsArr = Array.isArray(rowData[`${col}_InternalId`])
            ? rowData[`${col}_InternalId`].map(String)
            : [];
          preview.dataset.ids = idsArr.join(",");

          if (field.disableField) {
            preview.style.color = "#666";
            td.style.backgroundColor = "#f5f5f5";
            td.style.cursor = "not-allowed";
            td.appendChild(preview);
          } else {
            const editBtn = document.createElement("button");
            editBtn.textContent = "Edit";
            editBtn.className = "multi-select-edit";

            editBtn.addEventListener("click", () => {
              modal.classList.remove("hidden");
              modalOptions.innerHTML = "";
              modalSearch.value = "";

              const options = optionsByFieldName[field.name] || [];

              const selectedIds = Array.isArray(rowData[`${col}_InternalId`])
                ? rowData[`${col}_InternalId`].map((id) => String(id))
                : [];

              const selectedNames = Array.isArray(rowData[col])
                ? rowData[col].map((n) => String(n || "").toLowerCase())
                : [];

              const normalizeName = (str) =>
                (str || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

              const allOptionsWithCheck = options.map((opt) => {
                const optId = String(opt["Internal ID"] || opt.id);
                const optName = opt["Name"] || opt.name || "";
                const childName = optName.includes(":")
                  ? optName.split(":").pop().trim()
                  : optName;

                let isChecked = selectedIds.includes(optId);

                if (!isChecked) {
                  const normOpt = normalizeName(optName);
                  const normChild = normalizeName(childName);
                  isChecked = selectedNames.some(
                    (n) => normalizeName(n) === normOpt || normalizeName(n) === normChild
                  );
                }

                return { opt, isChecked };
              });

              const sortedOptions = [
                ...allOptionsWithCheck.filter((o) => o.isChecked),
                ...allOptionsWithCheck.filter((o) => !o.isChecked)
              ];

              sortedOptions.forEach(({ opt, isChecked }) => {
                const label = document.createElement("label");
                label.style.display = "flex";
                label.style.alignItems = "center";

                const cb = document.createElement("input");
                cb.type = "checkbox";
                cb.value = String(opt["Internal ID"] || opt.id);
                cb.checked = isChecked;

                label.appendChild(cb);
                label.appendChild(document.createTextNode(" " + (opt["Name"] || opt.name)));
                modalOptions.appendChild(label);
              });

              const preCheckedCount = modalOptions.querySelectorAll("input:checked").length;
              modalTitle.textContent = `Edit ${col} (${preCheckedCount} selected)`;

              modalSearch.oninput = () => {
                const term = modalSearch.value.toLowerCase();
                modalOptions.querySelectorAll("label").forEach((label) => {
                  const text = label.textContent.toLowerCase();
                  label.style.display = text.includes(term) ? "flex" : "none";
                });
              };

              modalSave.onclick = () => {
                const checked = [...modalOptions.querySelectorAll("input:checked")];
                const ids = checked.map((c) => String(c.value));
                const names = checked.map((c) => {
                  const opt = options.find((o) =>
                    String(o["Internal ID"] || o.id) === String(c.value)
                  );
                  return opt ? (opt["Name"] || opt.name) : "";
                }).filter(Boolean);

                rowData[col] = names;
                rowData[`${col}_InternalId`] = ids;
                preview.dataset.ids = ids.join(",");
                preview.textContent = isFabricColours
                  ? (names.length ? "✅" : "")
                  : names.join(", ");

                rowCheckbox.checked = true;
                highlightRow(rowCheckbox);
                modal.classList.add("hidden");
              };

              modalCancel.onclick = () => modal.classList.add("hidden");
            });

            td.appendChild(preview);
            td.appendChild(editBtn);
          }

        } else if (field && field.fieldType === "Checkbox") {
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
          td.textContent = rawVal || "";
          td.style.color = "#666";
          td.style.backgroundColor = "#f5f5f5";
          td.style.cursor = "not-allowed";

        } else if ((field && field.fieldType === "Link") || (typeof rawVal === "string" && /<a\s+[^>]*href=/i.test(rawVal))) {
          const linkEl = renderLinkValue(rawVal);
          if (linkEl) {
            td.appendChild(linkEl);
          } else {
            td.textContent = rawVal || "";
          }
          td.style.backgroundColor = "#f5f5f5";
          td.style.cursor = "default";

        } else if (field && field.fieldType === "Free-Form Text") {
          if (field.disableField) {
            td.textContent = rawVal || "";
            td.style.color = "#666";
            td.style.backgroundColor = "#f5f5f5";
            td.style.cursor = "not-allowed";
          } else {
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
          }

        } else {
          if (field && field.disableField) {
            td.textContent = rawVal || "";
            td.style.color = "#666";
            td.style.backgroundColor = "#f5f5f5";
            td.style.cursor = "not-allowed";
          } else {
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

  const dataIndex = Number(row.dataset.index);
  const rowData = filteredData[dataIndex] || {};

  const isTrue = (v) => {
    if (v === true || v === 1) return true;
    if (typeof v === "string") {
      const val = v.trim().toLowerCase();
      return ["true", "t", "1", "y", "yes"].includes(val);
    }
    return false;
  };

  row.classList.remove("is-parent", "is-inactive");

  if (isTrue(rowData["Is Parent"])) row.classList.add("is-parent");
  if (isTrue(rowData["Inactive"])) row.classList.add("is-inactive");

  if (!row.classList.contains("is-parent") && !row.classList.contains("is-inactive")) {
    const selected = row.querySelector("input.row-selector")?.checked;
    row.querySelectorAll("td").forEach((td, i) => {
      if (i === 0) return;
      td.style.backgroundColor = selected
        ? "var(--row-select)"
        : (row.sectionRowIndex % 2 ? "#f9f9f9" : "");
      td.style.color = "";
    });
  } else {
    row.querySelectorAll("td").forEach((td) => {
      td.style.backgroundColor = "";
      td.style.color = "";
    });
  }
}

function applyUpdates() {
  const table = document.querySelector("table.csv-table");
  if (!table) return;

  const allRows = Array.from(table.querySelectorAll("tr"));
  const rows = allRows.slice(1);

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

    const domP = readNum("Purchase Price");
    const domB = readNum("Base Price");
    const domR = readNum("Retail Price");
    const domM = readNum("Margin");

    const orig = baselineData[idx];
    const oP = normalize("Purchase Price", orig["Purchase Price"]);
    const oB = normalize("Base Price", orig["Base Price"]);
    const oR = normalize("Retail Price", orig["Retail Price"]);
    const oM = normalize("Margin", orig["Margin"]);

    const nP = domP != null ? normalize("Purchase Price", domP) : null;
    const nB = domB != null ? normalize("Base Price", domB) : null;
    const nR = domR != null ? normalize("Retail Price", domR) : null;
    const nM = domM != null ? normalize("Margin", domM) : null;

    let changedField = null;
    if (nM !== null && nM !== oM) changedField = "Margin";
    else if (nR !== null && nR !== oR) changedField = "Retail Price";
    else if (nB !== null && nB !== oB) changedField = "Base Price";
    else if (nP !== null && nP !== oP) changedField = "Purchase Price";

    if (!changedField) return;

    if (domP !== null) rowData["Purchase Price"] = domP;
    if (domB !== null) rowData["Base Price"] = domB;
    if (domR !== null) rowData["Retail Price"] = domR;
    if (domM !== null) rowData["Margin"] = domM;

    const updated = window.recalcRow(rowData, changedField);

    filteredData[idx] = updated;
    baselineData[idx] = { ...updated };
  });

  displayJSONTable(filteredData, { showAll: true }).then(() => {
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

// ✅ Automatically switch API base between local and Render
const API_BASE =
  window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:3000"
    : "https://suitepim.onrender.com";

async function pushUpdates() {
  const table = document.querySelector("table.csv-table");
  if (!table) return alert("No table found!");

  const rows = Array.from(table.querySelectorAll("tr")).slice(1);
  const rowsToPush = [];

  rows.forEach((row) => {
    const checkbox = row.querySelector("td input[type='checkbox'].row-selector");
    if (!checkbox || !checkbox.checked) return;

    const rowData = {};
    displayedColumns.forEach((col, colIdx) => {
      const td = row.children[colIdx + 1];
      if (!td) return;

      const field = fieldMap.find((f) => f.name === col);

      if (field && field.fieldType === "List/Record") {
        const select = td.querySelector("select");
        if (select) {
          const selectedId = select.value;
          const selectedText = select.options[select.selectedIndex]?.text || "";
          rowData[col] = selectedText;
          rowData[`${col}_InternalId`] = selectedId;
        }

      } else if (field && field.fieldType === "multiple-select") {
        const preview = td.querySelector(".multi-select-preview");
        const ids = preview?.dataset.ids ? preview.dataset.ids.split(",").filter(Boolean) : [];
        const names = preview?.textContent
          ? preview.textContent.split(",").map((s) => s.trim()).filter(Boolean)
          : [];
        rowData[col] = names;
        rowData[`${col}_InternalId`] = ids.map(String);

      } else if (field && field.fieldType === "Checkbox") {
        const cb = td.querySelector("input[type='checkbox']");
        rowData[col] = cb ? cb.checked : false;

      } else if (field && field.fieldType === "Free-Form Text") {
        const textarea = td.querySelector("textarea");
        rowData[col] = textarea ? textarea.value : td.textContent.trim();

      } else {
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

    if (response.status === 401) {
      alert("Login session expired — please re-login and try again.");
      window.location.href = "/";
      return;
    }

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
  .multi-select-modal.hidden {
    display: none;
  }
  .multi-select-modal {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.45);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .multi-select-content {
    width: min(720px, 92vw);
    max-height: 85vh;
    overflow: hidden;
    background: #fff;
    border-radius: 8px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .multi-select-search input {
    width: 100%;
    padding: 8px;
  }
  .multi-select-options {
    overflow: auto;
    border: 1px solid #ddd;
    border-radius: 6px;
    padding: 8px;
    min-height: 240px;
    max-height: 420px;
  }
  .multi-select-options label {
    padding: 4px 2px;
  }
  .multi-select-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  .multi-select-preview {
    display: inline-block;
    margin-right: 8px;
    white-space: normal;
    word-break: break-word;
  }
  .multi-select-edit {
    margin-left: 8px;
  }
`;
document.head.appendChild(style);

window.addEventListener("DOMContentLoaded", loadJSONData);