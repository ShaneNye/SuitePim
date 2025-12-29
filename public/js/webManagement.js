// ProductData.js
import { fieldMap } from "./fieldMap.js";

const SANDBOXjsonUrl =
  "https://7972741-sb1.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=4070&deploy=1&compid=7972741_SB1&ns-at=AAEJ7tMQ36KHWv402slQtrHVQ0QIFZOqj2KRxW39ZEthF8eqhic";

const PRODjsonUrl =
  "https://7972741.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=4365&deploy=1&compid=7972741&ns-at=AAEJ7tMQX3Lm8Lt3rpeFR1ezfurShY30Is8kgSGklUki_rKqMrQ";

// Pick environment (default Sandbox)
const environment = localStorage.getItem("environment") || "Sandbox";

const jsonUrl =
  environment.toLowerCase() === "production" ? PRODjsonUrl : SANDBOXjsonUrl;

const MAX_ROWS = 100;





// ✅ List of tool-generated columns
const toolColumns = ["Retail Price"];

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

    // --- 2) Preload all List/Record + multiple-select feeds first
    const preloadPromises = fieldMap
      .filter((f) => (f.fieldType === "List/Record" || f.fieldType === "multiple-select") && f.jsonFeed)
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

    // --- 3) Normalize multiple-select fields to arrays (names + IDs)
    fullData = fullData.map(row => {
      fieldMap.forEach(f => {
        if (f.fieldType === "multiple-select") {
          const val = row[f.name];

          // Normalize names
          if (typeof val === "string") {
            row[f.name] = val.split(",").map(s => s.trim()).filter(Boolean);
          } else if (!Array.isArray(val)) {
            row[f.name] = [];
          }

          // 🔑 Always rebuild IDs fresh from names
          const opts = listCache[f.name] || [];
          row[`${f.name}_InternalId`] = row[f.name].map(name => {
            const match = opts.find(o =>
              (o["Name"] || o.name || "").toLowerCase() === name.toLowerCase()
            );
            return match ? String(match["Internal ID"] || match.id) : null;
          }).filter(Boolean);

          // Debug: log mismatches
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


    // Apply tool columns
    if (typeof window.addRetailPriceTool === "function")
      fullData = window.addRetailPriceTool(fullData);

    filteredData = [...fullData];
    baselineData = JSON.parse(JSON.stringify(fullData));

    const columns = Object.keys(fullData[0] || {});
    displayedColumns = [
      ...columns.slice(0, 7),
      ...toolColumns.filter((tc) => !columns.slice(0, 7).includes(tc)),
    ];

    // --- 4) Build panels (hidden until table is ready)
    const panelsParent = document.createElement("div");
    panelsParent.classList.add("panel-parent", "is-hidden");
    container.appendChild(panelsParent);

    await renderFilterPanel(columns, panelsParent);
    renderFieldsPanel(columns, panelsParent);
    renderBulkActionPanel(columns, panelsParent);
    renderPushButton(panelsParent);

    // --- 5) Build table
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

      } else if (field && field.fieldType === "multiple-select") {
        // Reuse the existing table multi-select modal (#multi-select-modal)
        const btn = document.createElement("button");
        btn.type = "button";
        btn.classList.add("filter-multi-btn");
        btn.textContent = "Select";
        btn.dataset.field = selectedFieldName;

        // Store selection on the button (JSON strings)
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

          // Current selected IDs from this filter button
          let selectedIds = [];
          try { selectedIds = JSON.parse(btn.dataset.ids || "[]").map(String); } catch { selectedIds = []; }

          const normalizeName = (str) =>
            (str || "")
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, " ")
              .trim();

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

            // Checked first
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

          // IMPORTANT: overwrite modal handlers each time this filter opens it
          modalCancel.onclick = () => {
            modal.classList.add("hidden");
          };

          modalSave.onclick = () => {
            const ids = selectedIds.map(String);

            // Convert IDs -> names (store names for filtering)
            const names = ids.map(id => {
              const match = options.find(o => String(o["Internal ID"] || o.id) === id);
              return match ? (match["Name"] || match.name || "") : "";
            }).filter(Boolean);

            // Optional: ensure no duplicates by normalized name (handles prefix variants)
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

            // ✅ Persist both IDs and names on the button (Apply Filters reads names; IDs kept for future use)
            btn.dataset.ids = JSON.stringify(ids);
            btn.dataset.names = JSON.stringify(dedupedNames);

            renderPreview();
            modal.classList.add("hidden");
          };
        });

        renderPreview();
        valueTd.appendChild(btn);
        valueTd.appendChild(preview);
      }


      else {
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

  const valueInput = document.createElement("input");
  valueInput.type = "number";
  valueInput.id = "bulk-value-input";
  valueInput.placeholder = "Enter value";

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

  const applyBtn = document.createElement("button");
  applyBtn.textContent = "Apply";

  // Layout
  bulkPanel.appendChild(columnSelect);
  bulkPanel.appendChild(valueSearch);
  bulkPanel.appendChild(valueInput);
  bulkPanel.appendChild(valueSelect);
  bulkPanel.appendChild(actionSelect);
  bulkPanel.appendChild(dynamicControls);
  bulkPanel.appendChild(applyBtn);

  panelContainer.appendChild(bulkPanel);
  parent.appendChild(panelContainer);

  panelHeader.addEventListener("click", () => {
    bulkPanel.classList.toggle("collapsed");
    panelHeader.classList.toggle("collapsed");
  });

  // --- Bulk Multi-Select modal (created once) ---
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

  // State for bulk multi-select
  let bulkSelectedIds = [];
  let bulkSelectedNames = [];
  let bulkOptionsCache = [];

  // Helper to restore row selections after re-render
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

  // Column change behavior
  columnSelect.addEventListener("change", async () => {
    const col = columnSelect.value;
    const field = fieldMap.find((f) => f.name === col);
    dynamicControls.innerHTML = "";

    // Reset defaults UI
    valueInput.style.display = "inline-block";
    actionSelect.style.display = "inline-block";
    valueSearch.style.display = "none";
    valueSelect.style.display = "none";

    // Free-Form Text special case
    if (field && field.fieldType === "Free-Form Text") {
      valueInput.type = "text"; // normal text input
      valueInput.value = "";
      valueInput.placeholder = "Enter text value";

      valueInput.style.display = "inline-block";
      actionSelect.style.display = "none";   // hide Add By Value / Percent
      valueSelect.style.display = "none";
      valueSearch.style.display = "none";

      applyBtn.onclick = () => {
        applyBulkAction(col, valueInput.value, "Set To");
      };
      return;
    }

    //  List/Record fields
    if (field && field.fieldType === "List/Record") {
      valueInput.style.display = "none";
      actionSelect.style.display = "none";
      valueSearch.style.display = "none";
      valueSelect.style.display = "inline-block";

      // Load options from JSON feed
      const options = await getListOptions(field);
      valueSelect.innerHTML = "";
      options.forEach((opt) => {
        const option = document.createElement("option");
        option.value = String(opt["Internal ID"] || opt.id);
        option.textContent = opt["Name"] || opt.name;
        valueSelect.appendChild(option);
      });

      applyBtn.onclick = () => {
        const selectedId = valueSelect.value;
        const selected = options.find(
          (o) => String(o["Internal ID"] || o.id) === selectedId
        );
        if (!selected) return;

        applyBulkAction(
          col,
          selectedId,            // send ID for backend
          "Set List Value"       // custom flag
        );
      };
      return;
    }

    // 🔹 Rich-Text fields
    if (field && field.fieldType === "rich-text") {
      // Hide other controls
      valueInput.style.display = "none";
      actionSelect.style.display = "none";
      valueSearch.style.display = "none";
      valueSelect.style.display = "none";

      // Add a button to launch the editor
      const openBtn = document.createElement("button");
      openBtn.textContent = "Open Editor…";
      openBtn.style.marginLeft = "8px";

      let bulkHtml = ""; // store chosen HTML

      openBtn.addEventListener("click", () => {
        // Reuse the same rich-text modal already in your table
        let overlay = document.getElementById("rich-text-overlay");
        let modal = document.getElementById("rich-text-modal");

        if (!overlay || !modal) {
          alert("Rich-text modal not found. Open a rich-text cell once to initialise it.");
          return;
        }

        // Seed modal with bulkHtml (empty if none yet)
        const modalTextarea = modal.querySelector("#rich-modal-textarea");
        const modalPreview = modal.querySelector("#rich-modal-preview");
        if (modalTextarea && modalPreview) {
          modalTextarea.value = bulkHtml || "";
          modalPreview.innerHTML = bulkHtml || "<em>(empty)</em>";
        }

        // Show modal
        overlay.style.display = "block";
        modal.style.display = "flex";

        // Hook Save button just for bulk
        const modalSave = modal.querySelector("#rich-modal-save");
        const modalCancel = modal.querySelector("#rich-modal-cancel");

        const saveHandler = () => {
          // capture latest editor value
          bulkHtml = modalTextarea.style.display === "block"
            ? modalTextarea.value
            : modalPreview.innerHTML;

          overlay.style.display = "none";
          modal.style.display = "none";

          modalSave.removeEventListener("click", saveHandler);
          if (modalCancel) modalCancel.removeEventListener("click", cancelHandler);
        };

        const cancelHandler = () => {
          overlay.style.display = "none";
          modal.style.display = "none";
          modalSave.removeEventListener("click", saveHandler);
          if (modalCancel) modalCancel.removeEventListener("click", cancelHandler);
        };

        modalSave.addEventListener("click", saveHandler);
        if (modalCancel) modalCancel.addEventListener("click", cancelHandler);
      });

      dynamicControls.appendChild(openBtn);

      // Apply button → write bulkHtml to all selected rows
      applyBtn.onclick = () => {
        if (!bulkHtml) {
          alert("Please enter some rich-text content first.");
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
          filteredData[rowIndex][col] = bulkHtml;
        });

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
          const selectAll = document.querySelector('input[type="checkbox"].select-all');
          if (selectAll && allChecked) selectAll.checked = true;
        });
      };

      return;
    }



    // IMAGE fields
    if (field && field.fieldType === "image") {
      valueInput.style.display = "none";
      actionSelect.style.display = "none";
      valueSearch.style.display = "inline-block";
      valueSelect.style.display = "inline-block";

      const options = await getListOptions(field);

      const renderOptions = (filter = "") => {
        valueSelect.innerHTML = "";
        const filtered = options.filter(o =>
          (o["Name"] || "").toLowerCase().includes(filter.toLowerCase())
        );
        filtered.forEach((opt) => {
          const option = document.createElement("option");
          option.value = opt["Internal ID"] || opt.id;
          option.textContent = opt["Name"] || opt.name;
          valueSelect.appendChild(option);
        });
      };

      renderOptions();
      valueSearch.oninput = () => renderOptions(valueSearch.value);

      applyBtn.onclick = () => {
        const selectedId = valueSelect.value;
        const selected = options.find(o => (o["Internal ID"] || o.id) === selectedId);
        if (!selected) return;

        const table = document.querySelector("table.csv-table");
        if (!table) return;

        // Keep which rows are checked
        const checkedRowIndices = new Set();
        const allRowCbs = table.querySelectorAll('tr input[type="checkbox"].row-selector');
        const allChecked = [...allRowCbs].every(cb => cb.checked);

        table.querySelectorAll("tr").forEach((row, index) => {
          if (index === 0) return;
          const checkbox = row.querySelector("td input[type='checkbox'].row-selector");
          if (checkbox && checkbox.checked) checkedRowIndices.add(index - 1);
        });

        checkedRowIndices.forEach((rowIndex) => {
          filteredData[rowIndex][col] = selected.url;
          filteredData[rowIndex][`${col}_InternalId`] = selectedId;
        });

        displayJSONTable(filteredData).then(() => restoreSelections(checkedRowIndices, allChecked));
      };

      return;
    }

    // MULTIPLE-SELECT fields
    if (field && field.fieldType === "multiple-select") {
      // Action dropdown → Replace / Append / Remove
      actionSelect.innerHTML = "";
      ["Replace", "Append", "Remove"].forEach((mode) => {
        const opt = document.createElement("option");
        opt.value = mode;
        opt.textContent = mode;
        actionSelect.appendChild(opt);
      });

      // Hide numeric/list UI
      valueInput.style.display = "none";
      valueSelect.style.display = "none";
      valueSearch.style.display = "none";

      // Show preview + "Choose values…" button
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

      // Load options for modal
      bulkOptionsCache = await getListOptions(field);

      // --- helpers for robust matching & ID rebuild ---
      const normalizeName = (str) =>
        (str || "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, " ")
          .trim();

      const stripPrefix = (str) => {
        // turn "Parent : Child" -> "Child"
        const parts = String(str || "").split(":");
        return parts.length > 1 ? parts[parts.length - 1].trim() : String(str || "");
      };

      const candidatesFor = (label) => {
        // e.g. "Tension : 3 - Medium Firm" ->
        // ["tension 3 medium firm", "3 medium firm"]
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
        const idsArr = (namesArr || [])
          .map((nm) => idForName(nm))
          .filter(Boolean)
          .map(String);
        return idsArr;
      };

      const openBulkModal = () => {
        bulkModal.classList.remove("hidden");
        bulkTitle.textContent = `Choose values for ${col}`;
        bulkOptions.innerHTML = "";
        bulkSearch.value = "";

        // Build options (checkbox list)
        const renderBulkList = (filter = "") => {
          bulkOptions.innerHTML = "";
          const filtered = bulkOptionsCache.filter(o =>
            (o["Name"] || o.name || "").toLowerCase().includes(filter.toLowerCase())
          );

          // Selected first
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
              console.log(`[BULK][${col}] Modal tick`, { id, name, nowSelectedIds: [...bulkSelectedIds] });
            });

            label.appendChild(cb);
            label.appendChild(document.createTextNode((opt["Name"] || opt.name) ?? ""));
            bulkOptions.appendChild(label);
          });
        };

        renderBulkList();
        bulkSearch.oninput = () => renderBulkList(bulkSearch.value);

        bulkSave.onclick = () => {
          console.log(`[BULK][${col}] Modal Save`, {
            bulkSelectedIds: bulkSelectedIds.map(String),
            bulkSelectedNames: [...bulkSelectedNames]
          });
          preview.textContent = bulkSelectedNames.length
            ? `${bulkSelectedNames.join(", ")}`
            : "(no values chosen)";
          bulkModal.classList.add("hidden");
        };

        bulkCancel.onclick = () => {
          console.log(`[BULK][${col}] Modal Cancel`);
          bulkModal.classList.add("hidden");
        };
      };

      chooseBtn.onclick = () => {
        // start clean each time user changes column
        bulkSelectedIds = [];
        bulkSelectedNames = [];
        console.log(`[BULK][${col}] Open chooser (reset selections)`);
        openBulkModal();
      };

      // Apply bulk action
      applyBtn.onclick = () => {
        const mode = actionSelect.value; // Replace / Append / Remove
        console.log(`[BULK][${col}] Apply clicked`, {
          mode,
          bulkSelectedIds: bulkSelectedIds.map(String),
          bulkSelectedNames: [...bulkSelectedNames]
        });

        if (!bulkSelectedIds || bulkSelectedIds.length === 0) {
          alert("Choose one or more values first.");
          console.warn(`[BULK][${col}] No values chosen for apply`);
          return;
        }

        const table = document.querySelector("table.csv-table");
        if (!table) return;

        // Track which rows are checked
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

          console.group(`[BULK][${col}] Row ${rowIndex} BEFORE`);
          console.log("ids:", ids);
          console.log("names:", names);
          console.groupEnd();

          if (mode === "Replace") {
            ids = bulkSelectedIds.map(String);
            names = [...bulkSelectedNames];
            console.log(`[BULK][${col}] Row ${rowIndex} mode=Replace`, { ids, names });

          } else if (mode === "Append") {
            bulkSelectedIds.forEach((id, idx) => {
              const strId = String(id);
              const nameToAdd = bulkSelectedNames[idx];
              // avoid dup by name or id
              const alreadyHasId = ids.includes(strId);
              const alreadyHasName = names.some(n => normalizeName(n) === normalizeName(nameToAdd) || normalizeName(n) === normalizeName(stripPrefix(nameToAdd)));
              if (!alreadyHasId && !alreadyHasName) {
                ids.push(strId);
                names.push(nameToAdd);
                console.log(`[BULK][${col}] Row ${rowIndex} append`, { addedId: strId, addedName: nameToAdd });
              } else {
                console.log(`[BULK][${col}] Row ${rowIndex} append skipped (duplicate)`, { id: strId, name: nameToAdd });
              }
            });

          } else if (mode === "Remove") {
            // Build a set of normalized targets (full + child) for each chosen option
            const targetNorms = new Set();
            bulkSelectedNames.forEach((optName) => {
              candidatesFor(optName).forEach((c) => targetNorms.add(c));
            });

            // First try ID removals (where present)
            bulkSelectedIds.forEach((id) => {
              const strId = String(id);
              const idIdx = ids.findIndex(existingId => String(existingId) === strId);
              if (idIdx > -1) {
                ids.splice(idIdx, 1);
                console.log(`[BULK][${col}] Row ${rowIndex} removed by ID`, strId);
              }
            });

            // Then remove by normalized name, tolerant to prefixes/punctuation
            const nameNorms = names.map((n) => normalizeName(n));
            for (let i = names.length - 1; i >= 0; i--) {
              const nFull = nameNorms[i];
              const nChild = normalizeName(stripPrefix(names[i]));
              if (targetNorms.has(nFull) || targetNorms.has(nChild)) {
                console.log(`[BULK][${col}] Row ${rowIndex} removed by Name`, names[i]);
                names.splice(i, 1);
                // Do NOT splice ids by index (they may be misaligned). We'll rebuild IDs next.
              }
            }

            // After any removals, rebuild IDs from remaining names so arrays are aligned
            const rebuilt = rebuildIdsFromNames(names);
            console.log(`[BULK][${col}] Row ${rowIndex} rebuilt IDs from names`, rebuilt);
            ids = rebuilt;
          }

          console.group(`[BULK][${col}] Row ${rowIndex} AFTER`);
          console.log("ids:", ids);
          console.log("names:", names);
          console.groupEnd();

          filteredData[rowIndex][`${col}_InternalId`] = ids;
          filteredData[rowIndex][col] = names;
        });

        console.log(`[BULK][${col}] Re-render table after apply`);
        displayJSONTable(filteredData).then(() => restoreSelections(checkedRowIndices, allChecked));
      };

      return;
    }



    // Default (numeric / text / list single-select) branch
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

    applyBtn.onclick = () => {
      applyBulkAction(col, valueInput.value, actionSelect.value);
    };
  });

  // Initialize once
  columnSelect.dispatchEvent(new Event("change"));
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

  const KEY_FIELDS = ["Purchase Price", "Base Price", "Retail Price"];
  const isKeyField = KEY_FIELDS.includes(column);

  // Normalize action labels we’ll accept for “set”
  const isSetTo =
    action === "Set To" ||
    action === "Set" ||
    action === "Set Value" ||
    action === "Overwrite";

  checkedRowIndices.forEach((rowIndex) => {
    let rowData = { ...filteredData[rowIndex] };
    const field = fieldMap.find((f) => f.name === column);

    if (action === "Set List Value") {
      // List/Record field
      const options = (listCache[field?.name] || []);
      const selected = options.find((o) => o["Internal ID"] === value);
      rowData[column] = selected ? selected["Name"] : "";
      rowData[`${column}_InternalId`] = value;

    } else if (field && field.fieldType === "Free-Form Text") {
      // ✅ Handle text fields as plain strings
      if (isSetTo) {
        rowData[column] = value;
      }
      // No "Add By Value/Percent" for text → ignore

    } else {
      // Numeric bulk actions
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

// --- APPLY FILTERS (compatible with remove buttons + supports multiple-select modal filters) ---
function applyFilters() {
  const tbody = document.querySelector("#filter-tbody");
  if (!tbody) {
    filteredData = [...fullData];
    displayJSONTable(filteredData, { showAll: false }); // no filters → cap MAX_ROWS
    return;
  }

  // build filter rules from each row
  const rules = [];
  Array.from(tbody.querySelectorAll("tr")).forEach((tr) => {
    const fieldSelect = tr.querySelector("select.filter-field-select");
    if (!fieldSelect) return;

    const fieldName = fieldSelect.value;
    if (!fieldName) return;

    // detect field type
    const fm = fieldMap.find((f) => f.name === fieldName);

    // ✅ MULTIPLE-SELECT: read selected values from the filter button dataset
    if (fm && fm.fieldType === "multiple-select") {
      const btn = tr.querySelector("button.filter-multi-btn");
      if (!btn) return;

      let values = [];
      try { values = JSON.parse(btn.dataset.names || "[]"); } catch { values = []; }
      values = Array.isArray(values) ? values.filter(Boolean) : [];

      // ignore empty selection
      if (!values.length) return;

      rules.push({ field: fieldName, isMulti: true, values });
      return; // IMPORTANT: do not continue into text/select handling
    }

    // Existing controls for List/Record + Checkbox + text
    const valueSelect = tr.querySelector("select.filter-value-select");
    const valueInput = tr.querySelector("input.filter-value-input");

    let value = "";
    if (valueSelect) value = valueSelect.value?.trim() ?? "";
    else if (valueInput) value = valueInput.value?.trim() ?? "";

    // empty value means ignore this rule
    if (!value) return;

    const isListRecord = fm && fm.fieldType === "List/Record";
    const isCheckbox = fm && fm.fieldType === "Checkbox";

    rules.push({ field: fieldName, isMulti: false, isListRecord, isCheckbox, value });
  });

  if (rules.length === 0) {
    // --- No filters → reset to MAX_ROWS cap
    filteredData = [...fullData];
    displayJSONTable(filteredData, { showAll: false });
    return;
  }

  const normalize = (s) =>
    String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  const stripPrefix = (s) => {
    const parts = String(s || "").split(":");
    return parts.length > 1 ? parts[parts.length - 1].trim() : String(s || "");
  };

  // --- Apply AND logic across rules
  filteredData = fullData.filter((row) =>
    rules.every((r) => {
      // ✅ MULTI-SELECT: row value is an array of names (you normalize this on load)
      if (r.isMulti) {
        const arr = Array.isArray(row[r.field]) ? row[r.field] : [];
        if (!arr.length) return false;

        const rowNorms = new Set(arr.flatMap(v => [normalize(v), normalize(stripPrefix(v))]));

        // ANY selected value matches
        return r.values.some(v =>
          rowNorms.has(normalize(v)) || rowNorms.has(normalize(stripPrefix(v)))
        );
      }

      // Checkbox: exact boolean match against "true"/"false"
      if (r.isCheckbox) {
        const want = String(r.value).toLowerCase() === "true";
        const got =
          row[r.field] === true ||
          row[r.field] === 1 ||
          ["true", "t", "1", "y", "yes"].includes(String(row[r.field] || "").trim().toLowerCase());
        return got === want;
      }

      const cell = row[r.field] != null ? String(row[r.field]) : "";

      // List/Record: exact match on the Name
      if (r.isListRecord) {
        return cell === r.value;
      }

      // Free text: contains, case-insensitive
      return cell.toLowerCase().includes(String(r.value).toLowerCase());
    })
  );

  // --- Filters active → show all rows
  displayJSONTable(filteredData, { showAll: true });
}



// --- TABLE RENDER (with fade-in + resizable columns + safe Link rendering + multiple-select modal + image thumbnails with change button) ---
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

    // Preload list options for list/record + multiple-select fields
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

    // Colgroup
    const colgroup = document.createElement("colgroup");
    for (let i = 0; i < displayedColumns.length + 1; i++) {
      const col = document.createElement("col");
      col.style.width = i === 0 ? "40px" : "150px";
      colgroup.appendChild(col);
    }
    table.appendChild(colgroup);

    // Header
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");

    // Select all
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

    // Select all wiring
    selectAllCheckbox.addEventListener("change", () => {
      const rowCheckboxes = table.querySelectorAll("td input[type='checkbox'].row-selector");
      rowCheckboxes.forEach((cb) => {
        cb.checked = selectAllCheckbox.checked;
        highlightRow(cb);
      });
    });

    // Body
    const tbody = document.createElement("tbody");
    const rows = opts.showAll ? data : data.slice(0, MAX_ROWS);

    // Modal (created once) — reused for multiple-select
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

    // Rows
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

        // --- IMAGE FIELD ---
        if (field && field.fieldType === "image") {
          const renderThumbnail = (url, internalId) => {
            td.innerHTML = "";
            if (internalId) {
              td.dataset.internalid = internalId;
            }

            const wrapper = document.createElement("div");
            wrapper.style.display = "flex";
            wrapper.style.flexDirection = "column";
            wrapper.style.alignItems = "center";
            wrapper.style.gap = "2px";

            if (url) {
              const img = document.createElement("img");
              img.src = url;
              img.alt = col;
              img.loading = "lazy";
              img.style.maxWidth = "60px";
              img.style.maxHeight = "60px";
              img.style.objectFit = "cover";
              img.style.borderRadius = "4px";
              img.style.cursor = "pointer";
              img.addEventListener("click", () => window.open(url, "_blank"));
              wrapper.appendChild(img);
            } else {
              const placeholder = document.createElement("div");
              placeholder.textContent = "(no image)";
              placeholder.style.fontSize = "0.75rem";
              placeholder.style.color = "#888";
              wrapper.appendChild(placeholder);
            }

            const changeBtn = document.createElement("button");
            changeBtn.textContent = url ? "Change" : "Set Image";
            changeBtn.style.fontSize = "0.75rem";
            changeBtn.style.padding = "2px 6px";
            changeBtn.style.cursor = "pointer";

            changeBtn.addEventListener("click", async () => {
              td.innerHTML = "Loading…";
              const options = field.jsonFeed ? await getListOptions(field) : [];

              const chooser = document.createElement("div");
              chooser.style.display = "flex";
              chooser.style.flexDirection = "column";
              chooser.style.gap = "4px";

              const search = document.createElement("input");
              search.type = "text";
              search.placeholder = "Search images…";
              search.style.padding = "2px 4px";

              const select = document.createElement("select");
              select.size = 6;
              select.style.maxHeight = "120px";
              select.style.overflowY = "auto";

              const cancelBtn = document.createElement("button");
              cancelBtn.textContent = "Cancel";
              cancelBtn.style.marginTop = "4px";
              cancelBtn.addEventListener("click", () => {
                renderThumbnail(rowData[col], rowData[`${col}_InternalId`]);
              });

              const renderOptions = (filter = "") => {
                select.innerHTML = "";
                const filtered = options.filter(o =>
                  (o["Name"] || "").toLowerCase().includes(filter.toLowerCase())
                );
                filtered.forEach(opt => {
                  const option = document.createElement("option");
                  option.value = opt["Internal ID"];
                  option.textContent = opt["Name"];
                  if (rowData[`${col}_InternalId`] === opt["Internal ID"]) {
                    option.selected = true;
                  }
                  select.appendChild(option);
                });
              };

              renderOptions();

              search.addEventListener("input", () => renderOptions(search.value));

              select.addEventListener("change", () => {
                const selectedId = select.value;
                const selected = options.find(o => o["Internal ID"] === selectedId);
                if (selected) {
                  rowData[col] = selected.url;
                  rowData[`${col}_InternalId`] = selectedId;
                  td.dataset.internalid = selectedId;
                  rowCheckbox.checked = true;
                  highlightRow(rowCheckbox);
                  renderThumbnail(selected.url, selectedId);
                }
              });

              chooser.appendChild(search);
              chooser.appendChild(select);
              chooser.appendChild(cancelBtn);
              td.innerHTML = "";
              td.appendChild(chooser);
              search.focus();
            });

            wrapper.appendChild(changeBtn);
            td.appendChild(wrapper);
          };

          renderThumbnail(rawVal, rowData[`${col}_InternalId`]);
        }

        // --- LIST/RECORD FIELD ---
        else if (field && field.fieldType === "List/Record") {
          if (field.disableField) {
            td.textContent = rawVal || "";
            td.style.color = "#666";
            td.style.backgroundColor = "#f5f5f5";
            td.style.cursor = "not-allowed";
          } else {
            const select = document.createElement("select");
            select.classList.add("theme-select");
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
          }
        }
        // --- RICH TEXT FIELD ---
        else if (field && field.fieldType === "rich-text") {
          const wrapper = document.createElement("div");
          wrapper.style.display = "flex";
          wrapper.style.flexDirection = "column";
          wrapper.style.gap = "4px";

          // helper: decode escaped HTML (multi-pass)
          const decodeHtmlEntities = (str) => {
            if (!str) return "";
            const txt = document.createElement("textarea");
            let prev = str;
            let decoded = str;
            do {
              prev = decoded;
              txt.innerHTML = prev;
              decoded = txt.value;
            } while (decoded !== prev);
            return decoded;
          };

          const preview = document.createElement("div");
          preview.className = "rich-preview";
          preview.style.border = "1px solid #ccc";
          preview.style.padding = "4px";
          preview.style.minHeight = "40px";
          preview.style.background = "#fafafa";
          preview.style.maxHeight = "140px";
          preview.style.overflow = "auto";

          const textarea = document.createElement("textarea");
          textarea.className = "rich-raw"; // ✅ pushUpdates reads this
          textarea.rows = 4;
          textarea.style.display = "none";
          textarea.style.resize = "vertical";
          textarea.spellcheck = false;

          // Seed values
          const initialRaw = (typeof rawVal === "string" ? rawVal : "") || "";
          const initialDecoded = decodeHtmlEntities(initialRaw);
          rowData[col] = initialRaw;
          textarea.value = initialRaw;
          preview.innerHTML = initialDecoded || "<em>(empty)</em>";

          const toggleBtn = document.createElement("button");
          toggleBtn.textContent = "Show HTML";
          toggleBtn.style.fontSize = "0.75rem";

          const expandBtn = document.createElement("button");
          expandBtn.textContent = "Expand";
          expandBtn.style.fontSize = "0.75rem";
          expandBtn.style.marginLeft = "4px";

          let showingHtml = false;

          const showPreview = () => {
            const v = textarea.value;
            const decoded = decodeHtmlEntities(v);
            preview.innerHTML = decoded || "<em>(empty)</em>";
            rowData[col] = v;
            textarea.style.display = "none";
            preview.style.display = "block";
            toggleBtn.textContent = "Show HTML";
            showingHtml = false;
          };

          const showHtml = () => {
            textarea.value = rowData[col] || "";
            textarea.style.display = "block";
            preview.style.display = "none";
            toggleBtn.textContent = "Show Preview";
            showingHtml = true;
          };

          toggleBtn.addEventListener("click", () => {
            if (showingHtml) {
              showPreview();
            } else {
              showHtml();
            }
          });

          textarea.addEventListener("input", () => {
            rowData[col] = textarea.value;
            rowCheckbox.checked = true;
            highlightRow(rowCheckbox);
          });

          // --- Modal for expanded editing (with side panel + proper caret restore) ---
          expandBtn.addEventListener("click", () => {
            let overlay = document.getElementById("rich-text-overlay");
            let modal = document.getElementById("rich-text-modal");

            if (!overlay) {
              overlay = document.createElement("div");
              overlay.id = "rich-text-overlay";
              overlay.style.position = "fixed";
              overlay.style.top = 0;
              overlay.style.left = 0;
              overlay.style.width = "100%";
              overlay.style.height = "100%";
              overlay.style.background = "rgba(0,0,0,0.5)";
              overlay.style.display = "none";
              overlay.style.zIndex = "9998";
              document.body.appendChild(overlay);
            }

            if (!modal) {
              modal = document.createElement("div");
              modal.id = "rich-text-modal";
              modal.style.position = "fixed";
              modal.style.top = "50%";
              modal.style.left = "50%";
              modal.style.transform = "translate(-50%, -50%)";
              modal.style.background = "#fff";
              modal.style.borderRadius = "6px";
              modal.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
              modal.style.zIndex = "9999";
              modal.style.width = "92%";
              modal.style.maxWidth = "1200px";
              modal.style.height = "86%";
              modal.style.display = "flex";
              modal.style.flexDirection = "column";

              modal.innerHTML = `
        <div style="padding:10px;border-bottom:1px solid #ddd;display:flex;justify-content:space-between;align-items:center;">
          <h3 style="margin:0;font-size:1rem;">Edit Rich Text</h3>
          <button id="rich-modal-close" style="font-size:1.2rem;line-height:1;background:none;border:none;cursor:pointer;">×</button>
        </div>

        <!-- Toolbar -->
        <div id="rich-modal-toolbar" style="padding:6px;border-bottom:1px solid #ddd;display:flex;gap:6px;flex-wrap:wrap;background:#f9f9f9;">
          <button data-cmd="formatBlock" data-value="h1">H1</button>
          <button data-cmd="formatBlock" data-value="h2">H2</button>
          <button data-cmd="formatBlock" data-value="p">P</button>
          <button data-cmd="insertUnorderedList">• List</button>
          <button data-cmd="insertOrderedList">1. List</button>
          <button data-cmd="bold"><b>B</b></button>
          <button data-cmd="italic"><i>I</i></button>
          <button data-cmd="underline"><u>U</u></button>
        </div>

        <!-- Content -->
        <div id="rich-modal-content" style="flex:1; display:flex; overflow:hidden;">
          <!-- Editor -->
          <div id="rich-modal-editor" style="flex:3; display:flex; flex-direction:column; min-width:0;">
            <div id="rich-modal-preview" class="rich-preview"
                 style="flex:1;overflow:auto;padding:10px; outline:none;"
                 contenteditable="true"></div>
            <textarea id="rich-modal-textarea"
                      style="flex:1;display:none;margin:10px;font-family:monospace;"></textarea>
          </div>
          <!-- Side Panel -->
          <div id="rich-modal-fields"
               style="flex:1; border-left:1px solid #ddd; overflow:auto; padding:8px; background:#fafafa;">
            <div style="display:flex; align-items:center; gap:6px; margin-bottom:6px;">
              <h4 style="margin:0; flex:1;">Insert Fields</h4>
              <input id="rich-fields-filter" type="text" placeholder="Filter…" style="padding:4px 6px; width:45%;">
            </div>
            <div id="rich-fields-list"></div>
          </div>
        </div>

        <!-- Footer -->
        <div style="padding:10px;border-top:1px solid #ddd;display:flex;justify-content:space-between;">
          <button id="rich-modal-toggle">Show HTML</button>
          <div>
            <button id="rich-modal-cancel">Cancel</button>
            <button id="rich-modal-save">Save</button>
          </div>
        </div>
      `;
              document.body.appendChild(modal);

              // toolbar event delegation
              modal.querySelector("#rich-modal-toolbar").addEventListener("click", (e) => {
                if (e.target.tagName === "BUTTON") {
                  const cmd = e.target.dataset.cmd;
                  const val = e.target.dataset.value || null;
                  document.execCommand(cmd, false, val);
                }
              });

              // close button
              modal.querySelector("#rich-modal-close").onclick = () => {
                overlay.style.display = "none";
                modal.style.display = "none";
              };
            }

            const modalPreview = modal.querySelector("#rich-modal-preview");
            const modalTextarea = modal.querySelector("#rich-modal-textarea");
            const modalToggle = modal.querySelector("#rich-modal-toggle");
            const modalCancel = modal.querySelector("#rich-modal-cancel");
            const modalSave = modal.querySelector("#rich-modal-save");
            const fieldsPanel = modal.querySelector("#rich-modal-fields");
            const fieldsFilter = modal.querySelector("#rich-fields-filter");
            const fieldsList = modal.querySelector("#rich-fields-list");

            let modalShowingHtml = false;

            // ---- caret/selection tracking ----
            let savedRange = null; // for contenteditable
            const savedTextSel = { start: null, end: null }; // for textarea

            const savePreviewSelection = () => {
              const sel = window.getSelection();
              if (sel && sel.rangeCount > 0) {
                savedRange = sel.getRangeAt(0).cloneRange();
              }
            };
            const saveTextareaSelection = () => {
              savedTextSel.start = modalTextarea.selectionStart;
              savedTextSel.end = modalTextarea.selectionEnd;
            };

            const placeCaretAtEnd = (el) => {
              if (!el) return;
              if (el.isContentEditable) {
                const range = document.createRange();
                range.selectNodeContents(el);
                range.collapse(false);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
                savedRange = range.cloneRange();
              } else if (el === modalTextarea) {
                el.focus();
                el.selectionStart = el.selectionEnd = el.value.length;
                saveTextareaSelection();
              }
            };

            const insertAtCaret = (text) => {
              if (modalShowingHtml) {
                // HTML textarea mode
                modalTextarea.focus();
                // try saved positions first
                let start = typeof savedTextSel.start === "number" ? savedTextSel.start : modalTextarea.selectionStart;
                let end = typeof savedTextSel.end === "number" ? savedTextSel.end : modalTextarea.selectionEnd;
                if (typeof start !== "number" || typeof end !== "number") {
                  start = end = modalTextarea.value.length;
                }
                modalTextarea.value = modalTextarea.value.slice(0, start) + text + modalTextarea.value.slice(end);
                const newPos = start + text.length;
                modalTextarea.selectionStart = modalTextarea.selectionEnd = newPos;
                saveTextareaSelection();
              } else {
                // WYSIWYG (contenteditable)
                modalPreview.focus();
                let range = savedRange ? savedRange.cloneRange() : null;

                // if no saved range, try current selection; else append at end
                if (!range) {
                  const sel = window.getSelection();
                  if (sel && sel.rangeCount > 0) {
                    range = sel.getRangeAt(0).cloneRange();
                  } else {
                    placeCaretAtEnd(modalPreview);
                    range = savedRange ? savedRange.cloneRange() : null;
                  }
                }
                if (!range) return; // safety

                range.deleteContents();
                const node = document.createTextNode(text);
                range.insertNode(node);

                // move caret after inserted node
                const after = document.createRange();
                after.setStartAfter(node);
                after.setEndAfter(node);
                const sel2 = window.getSelection();
                sel2.removeAllRanges();
                sel2.addRange(after);
                savedRange = after.cloneRange(); // persist last caret
              }
            };

            // wire listeners to keep last caret/selection
            ["keyup", "mouseup", "input", "focus"].forEach(evt =>
              modalPreview.addEventListener(evt, savePreviewSelection)
            );
            ["keyup", "mouseup", "input", "select", "focus"].forEach(evt =>
              modalTextarea.addEventListener(evt, saveTextareaSelection)
            );

            // ---- mode switching ----
            const modalShowPreview = () => {
              modalPreview.innerHTML = modalTextarea.value || "<em>(empty)</em>";
              modalTextarea.style.display = "none";
              modalPreview.style.display = "block";
              modalToggle.textContent = "Show HTML";
              modalShowingHtml = false;
              placeCaretAtEnd(modalPreview);
            };

            const modalShowHtml = () => {
              modalTextarea.value = modalPreview.innerHTML;
              modalTextarea.style.display = "block";
              modalPreview.style.display = "none";
              modalToggle.textContent = "Show Preview";
              modalShowingHtml = true;
              placeCaretAtEnd(modalTextarea);
            };

            // seed modal with current value
            modalTextarea.value = rowData[col] || "";
            modalShowPreview();

            modalToggle.onclick = () => {
              if (modalShowingHtml) modalShowPreview();
              else modalShowHtml();
            };

            modalCancel.onclick = () => {
              overlay.style.display = "none";
              modal.style.display = "none";
            };

            modalSave.onclick = () => {
              const newVal = modalShowingHtml ? modalTextarea.value : modalPreview.innerHTML;
              rowData[col] = newVal;
              // keep hidden textarea.rich-raw in sync
              textarea.value = newVal;
              showPreview(); // refresh cell preview
              rowCheckbox.checked = true;
              highlightRow(rowCheckbox);
              overlay.style.display = "none";
              modal.style.display = "none";
            };

            // --- Populate Fields Panel (ALL fields from the row, static insertion) ---
            const toDisplay = (v) => {
              if (v == null) return "";
              if (Array.isArray(v)) return v.join(", ");
              if (typeof v === "object") {
                try { return JSON.stringify(v); } catch { return String(v); }
              }
              if (typeof v === "boolean") return v ? "true" : "false";
              return String(v);
            };

            const renderFieldsList = (filterText = "") => {
              fieldsList.innerHTML = "";
              const entries = Object.entries(rowData)
                .filter(([k]) => k !== col) // exclude the rich-text field itself
                .sort((a, b) => a[0].localeCompare(b[0]));

              const lcFilter = filterText.trim().toLowerCase();

              entries.forEach(([key, value]) => {
                const displayVal = toDisplay(value);
                const line = `${key}: ${displayVal}`;
                if (lcFilter && !line.toLowerCase().includes(lcFilter)) return;

                const item = document.createElement("div");
                item.style.cursor = "pointer";
                item.style.padding = "6px 8px";
                item.style.borderBottom = "1px solid #eee";
                item.style.fontSize = "0.85rem";
                item.style.userSelect = "none";
                item.title = line; // tooltip with full value
                // Render label + value with wrapping
                item.innerHTML = `<strong style="display:block; margin-bottom:2px;">${key}</strong><div style="white-space:normal; word-break:break-word;">${displayVal}</div>`;

                item.addEventListener("mousedown", (e) => {
                  // prevent focus loss flicker
                  e.preventDefault();
                });
                item.addEventListener("click", () => {
                  insertAtCaret(displayVal);
                });

                fieldsList.appendChild(item);
              });

              if (!fieldsList.children.length) {
                const empty = document.createElement("div");
                empty.textContent = "No fields match your filter.";
                empty.style.color = "#777";
                empty.style.padding = "8px";
                fieldsList.appendChild(empty);
              }
            };

            renderFieldsList();
            fieldsFilter.addEventListener("input", () => renderFieldsList(fieldsFilter.value));

            overlay.style.display = "block";
            modal.style.display = "flex";
          });

          const btnRow = document.createElement("div");
          btnRow.style.display = "flex";
          btnRow.style.gap = "4px";
          btnRow.appendChild(toggleBtn);
          btnRow.appendChild(expandBtn);

          wrapper.appendChild(preview);
          wrapper.appendChild(textarea);
          wrapper.appendChild(btnRow);
          td.appendChild(wrapper);

          showPreview(); // start in preview mode
        }


        // --- MULTIPLE-SELECT FIELD ---
        else if (field && field.fieldType === "multiple-select") {
          if (field.disableField) {
            td.textContent = Array.isArray(rawVal) ? rawVal.join(", ") : (rawVal || "");
            td.style.color = "#666";
            td.style.backgroundColor = "#f5f5f5";
            td.style.cursor = "not-allowed";
          } else {
            const preview = document.createElement("span");
            preview.textContent = Array.isArray(rawVal) ? rawVal.join(", ") : (rawVal || "");
            preview.className = "multi-select-preview";

            const editBtn = document.createElement("button");
            editBtn.textContent = "Edit";
            editBtn.className = "multi-select-edit";

            editBtn.addEventListener("click", () => {
              modal.classList.remove("hidden");
              modalOptions.innerHTML = "";
              modalSearch.value = "";

              const options = optionsByFieldName[field.name] || [];

              // ✅ Normalized selected IDs as strings
              const selectedIds = Array.isArray(rowData[`${col}_InternalId`])
                ? rowData[`${col}_InternalId`].map(id => String(id))
                : [];

              // ✅ Also collect names from the row (for child-name fallback)
              const selectedNames = Array.isArray(rowData[col])
                ? rowData[col].map(n => n.toLowerCase())
                : [];

              // Helper: normalize names
              const normalizeName = (str) =>
                (str || "")
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, " ")
                  .trim();

              // Build option list with isChecked flag
              const allOptionsWithCheck = options.map(opt => {
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
                    n => normalizeName(n) === normOpt || normalizeName(n) === normChild
                  );
                }

                return { opt, isChecked };
              });

              // ✅ Sort so checked appear first
              const sortedOptions = [
                ...allOptionsWithCheck.filter(o => o.isChecked),
                ...allOptionsWithCheck.filter(o => !o.isChecked)
              ];

              sortedOptions.forEach(({ opt, isChecked }) => {
                const label = document.createElement("label");
                label.style.display = "flex";
                label.style.alignItems = "center";

                const cb = document.createElement("input");
                cb.type = "checkbox";
                cb.value = String(opt["Internal ID"] || opt.id);
                cb.checked = isChecked;

                if (cb.checked) {
                  console.log(`✅ Pre-checked: ${cb.value} (${opt["Name"] || opt.name})`);
                }

                label.appendChild(cb);
                label.appendChild(document.createTextNode(" " + (opt["Name"] || opt.name)));
                modalOptions.appendChild(label);
              });

              // Update title with count of actually checked options
              const preCheckedCount = modalOptions.querySelectorAll("input:checked").length;
              modalTitle.textContent = `Edit ${col} (${preCheckedCount} selected)`;

              modalSearch.oninput = () => {
                const term = modalSearch.value.toLowerCase();
                modalOptions.querySelectorAll("label").forEach(label => {
                  const text = label.textContent.toLowerCase();
                  label.style.display = text.includes(term) ? "flex" : "none";
                });
              };

              modalSave.onclick = () => {
                const checked = [...modalOptions.querySelectorAll("input:checked")];
                const ids = checked.map(c => String(c.value));
                const names = checked.map(c => {
                  const opt = options.find(o =>
                    String(o["Internal ID"] || o.id) === String(c.value)
                  );
                  return opt ? (opt["Name"] || opt.name) : "";
                });

                console.log("💾 Saving selection", { ids, names });

                rowData[col] = names;
                rowData[`${col}_InternalId`] = ids;
                preview.dataset.ids = ids.join(",");
                preview.textContent = names.join(", ");

                rowCheckbox.checked = true;
                highlightRow(rowCheckbox);
                modal.classList.add("hidden");
              };

              modalCancel.onclick = () => modal.classList.add("hidden");
            });

            td.appendChild(preview);
            td.appendChild(editBtn);
          }
        }


        // --- CHECKBOX FIELD ---
        else if (field && field.fieldType === "Checkbox") {
          if (field.disableField) {
            td.textContent =
              String(rawVal).toLowerCase() === "true" || rawVal === "1" || rawVal === true
                ? "✔"
                : "";
            td.style.textAlign = "center";
            td.style.color = "#666";
            td.style.backgroundColor = "#f5f5f5";
            td.style.cursor = "not-allowed";
          } else {
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
          }
        }

        // --- PRICE FIELDS ---
        else if (["Purchase Price", "Base Price", "Retail Price"].includes(col)) {
          if (field && field.disableField) {
            td.textContent = rawVal || "";
            td.style.color = "#666";
            td.style.backgroundColor = "#f5f5f5";
            td.style.cursor = "not-allowed";
          } else {
            const input = document.createElement("input");
            input.type = "number";
            input.step = col === "Retail Price" ? "1" : "0.01";
            input.value = rawVal || "";
            input.addEventListener("input", () => {
              rowData[col] = input.value;
              rowCheckbox.checked = true;
              highlightRow(rowCheckbox);
            });
            td.appendChild(input);
          }
        }

        // --- INTERNAL ID ---
        else if (col === "Internal ID") {
          td.textContent = rawVal || "";
          td.style.color = "#666";
          td.style.backgroundColor = "#f5f5f5";
          td.style.cursor = "not-allowed";
        }

        // --- LINK FIELDS ---
        else if ((field && field.fieldType === "Link") || (typeof rawVal === "string" && /<a\s+[^>]*href=/i.test(rawVal))) {
          const linkEl = renderLinkValue(rawVal);
          if (linkEl) td.appendChild(linkEl);
          else td.textContent = rawVal || "";
          td.style.backgroundColor = "#f5f5f5";
          td.style.cursor = "default";
        }

        // --- FREE TEXT ---
        else if (field && field.fieldType === "Free-Form Text") {
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
        }

        // --- DEFAULT TEXT INPUT ---
        else {
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

const API_BASE = "https://suitepim.onrender.com"; // ✅ backend server

async function pushUpdates() {
  const table = document.querySelector("table.csv-table");
  if (!table) {
    alert("No table found!");
    console.error("❌ pushUpdates: No table element found in DOM.");
    return;
  }

  const rows = Array.from(table.querySelectorAll("tr")).slice(1); // skip header
  const rowsToPush = [];

  rows.forEach((row) => {
    const checkbox = row.querySelector("td input[type='checkbox'].row-selector");
    if (!checkbox || !checkbox.checked) return;

    const rowData = {};
    displayedColumns.forEach((col, colIdx) => {
      const td = row.children[colIdx + 1];
      if (!td) return;

      const field = fieldMap.find((f) => f.name === col);

      // --- Handle various field types ---
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
        const ids = preview?.dataset.ids ? preview.dataset.ids.split(",") : [];
        const names = preview?.textContent
          ? preview.textContent.split(",").map((s) => s.trim())
          : [];
        rowData[col] = names;
        rowData[`${col}_InternalId`] = ids.map(String);

      } else if (field && field.fieldType === "image") {
        const storedId = td.dataset.internalid || "";
        const img = td.querySelector("img");
        const url = img ? img.src : "";
        rowData[`${col}_InternalId`] = storedId ? String(storedId) : "";
        rowData[col] = td.dataset.filename || "";
        rowData[`${col}_Url`] = url;

      } else if (field && field.fieldType === "Checkbox") {
        const cb = td.querySelector("input[type='checkbox']");
        rowData[col] = cb ? cb.checked : false;

      } else if (field && field.fieldType === "Free-Form Text") {
        const textarea = td.querySelector("textarea");
        rowData[col] = textarea ? textarea.value : td.textContent.trim();

      } else if (field && field.fieldType === "rich-text") {
        const textarea = td.querySelector("textarea.rich-raw");
        rowData[col] = textarea
          ? textarea.value
          : td.querySelector(".rich-preview")?.innerHTML || "";

      } else {
        const input = td.querySelector("input");
        rowData[col] = input ? input.value : td.textContent.trim();
      }
    });

    rowsToPush.push(rowData);
  });

  if (rowsToPush.length === 0) {
    alert("No rows selected to push.");
    console.warn("⚠️ pushUpdates: No rows were selected for push.");
    return;
  }

  console.log("🚀 Payload rows (pre-send):", rowsToPush);

  // --- Progress UI ---
  let progressContainer = document.getElementById("push-progress-container");
  if (!progressContainer) {
    console.warn("⚠️ Missing progress container; creating temporary element.");
    progressContainer = document.createElement("div");
    progressContainer.id = "push-progress-container";
    document.body.appendChild(progressContainer);
  }

  progressContainer.innerHTML = `<p>Queueing push of ${rowsToPush.length} rows...</p>`;

  try {
    const response = await fetch(`${API_BASE}/push-updates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: rowsToPush }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status} - ${text}`);
    }

    const data = await response.json();
    if (!data.success) {
      progressContainer.innerHTML = `<p style="color:red;">❌ Failed to queue push: ${data.message || "Unknown server error"}</p>`;
      console.error("❌ Server error response:", data);
      window.updateFooterProgress?.(0, rowsToPush.length, "error", 0, 0);
      return;
    }

    // --- Queue started successfully ---
    const { jobId, queuePos, queueTotal } = data;
    localStorage.setItem("lastJobId", jobId);
    progressContainer.innerHTML = `<p>🚀 Job queued (Job ${queuePos} of ${queueTotal})</p>`;
    window.updateFooterProgress?.(0, rowsToPush.length, "pending", queuePos, queueTotal);

    // --- Poll job status ---
    const interval = setInterval(async () => {
      try {
        const statusRes = await fetch(`${API_BASE}/push-status/${jobId}`);
        if (!statusRes.ok) throw new Error(`Status HTTP ${statusRes.status}`);

        const statusData = await statusRes.json();
        if (!statusData || !statusData.status) {
          throw new Error("Invalid status response");
        }

        const { status, processed, total, results = [], queuePos, queueTotal } = statusData;

        progressContainer.innerHTML = `<p>Status: ${status} — ${processed}/${total} rows processed</p>`;
        window.updateFooterProgress?.(processed, total, status, queuePos, queueTotal);

        if (status === "completed" || status === "error") {
          clearInterval(interval);

          const successCount = results.filter(
            (r) => r.status === "Success" || r.status === 200 || r.status === 204
          ).length;
          const failCount = total - successCount;

          let html = `<p>✅ Push finished. ${successCount} of ${total} rows updated successfully.</p>`;
          if (failCount > 0) html += `<p style="color:red;">❌ ${failCount} row(s) failed to update.</p>`;

          progressContainer.innerHTML = html;
          window.updateFooterProgress?.(processed, total, status, queuePos, queueTotal);
          localStorage.removeItem("lastJobId");
        }
      } catch (err) {
        console.error("❌ Polling error:", err);
        progressContainer.innerHTML += `<p style="color:red;">❌ Error polling job status: ${err.message}</p>`;
        window.updateFooterProgress?.(0, rowsToPush.length, "error", 0, 0);
        clearInterval(interval);
      }
    }, 3000);
  } catch (err) {
    console.error("❌ Push request failed:", err);
    let msg = err.message.includes("Failed to fetch")
      ? "Network/CORS error — your backend may not be reachable or CORS isn’t enabled."
      : err.message;
    progressContainer.innerHTML = `<p style="color:red;">❌ Push failed: ${msg}</p>`;
    window.updateFooterProgress?.(0, rowsToPush.length, "error", 0, 0);
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
