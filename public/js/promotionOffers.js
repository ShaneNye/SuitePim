// promotionOffers.js
console.log("✅ promotionOffers.js loaded");

import { fieldMap } from "./fieldMap.js";

const jsonUrl =
  "https://7972741-sb1.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=4074&deploy=1&compid=7972741_SB1&ns-at=AAEJ7tMQWUGcZwJHNV7qBCq1DqRIZbQtRBHmXKiGQxDAyKqdmaE";

let fullData = [];
let listCache = {};

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
async function loadPromotionPage() {
  const container = document.getElementById("table-data");
  container.innerHTML = "<p>Loading product data…</p>";

  try {
    const res = await fetch(jsonUrl);
    fullData = await res.json();
    container.innerHTML = "";
    renderPromotionUI(container);
  } catch (err) {
    container.innerHTML = "<p style='color:red;'>❌ Failed to load product data</p>";
    console.error(err);
  }
}

// --- MAIN UI ---
function renderPromotionUI(container) {
  const wrapper = document.createElement("div");
  wrapper.className = "promo-wrapper";
  container.appendChild(wrapper);

  // Promotion Title with save/edit
  const titleWrap = document.createElement("div");
  titleWrap.className = "promo-title-wrap";

  const titleInput = document.createElement("input");
  titleInput.type = "text";
  titleInput.placeholder = "Enter promotion name...";
  titleInput.className = "promo-title-input";

  const saveBtn = document.createElement("button");
  saveBtn.textContent = "Save";
  saveBtn.className = "btn primary";

  titleWrap.appendChild(titleInput);
  titleWrap.appendChild(saveBtn);
  wrapper.appendChild(titleWrap);

  saveBtn.onclick = () => {
    const value = titleInput.value.trim();
    if (!value) return;
    titleWrap.innerHTML = `
      <h2 class="promo-title-text">${value}</h2>
      <button class="btn small edit-btn">✏️</button>
    `;
    const editBtn = titleWrap.querySelector(".edit-btn");
    editBtn.onclick = () => {
      titleWrap.innerHTML = "";
      titleWrap.appendChild(titleInput);
      titleWrap.appendChild(saveBtn);
    };
  };

  const addSectionBtn = document.createElement("button");
  addSectionBtn.textContent = "+ Add Section";
  addSectionBtn.className = "btn primary";
  addSectionBtn.onclick = () => createSection(wrapper);
  wrapper.appendChild(addSectionBtn);
}

// --- CREATE SECTION ---
function createSection(container) {
  const section = document.createElement("div");
  section.className = "promo-section";

  const header = document.createElement("div");
  header.className = "promo-section-header";

  const labelInput = document.createElement("input");
  labelInput.placeholder = "Section Label";
  labelInput.className = "text-input section-label";

  const addRowBtn = document.createElement("button");
  addRowBtn.textContent = "+ Add Row";
  addRowBtn.className = "btn";
  addRowBtn.onclick = () => createRow(section);

  header.appendChild(labelInput);
  header.appendChild(addRowBtn);
  section.appendChild(header);
  container.appendChild(section);
}

// --- CREATE ROW ---
function createRow(section) {
  const row = document.createElement("div");
  row.className = "promo-row";

  const header = document.createElement("div");
  header.className = "promo-row-header";

  const label = document.createElement("input");
  label.placeholder = "Row Label";
  label.className = "text-input row-label";

  const badge = document.createElement("span");
  badge.className = "filter-badge hidden";
  badge.textContent = "0 filters";

  const btnGroup = document.createElement("div");
  btnGroup.className = "row-btn-group";

  const settingsBtn = document.createElement("button");
  settingsBtn.textContent = "⚙ Settings";
  settingsBtn.className = "btn";
  settingsBtn.onclick = () => openSettingsModal(row, badge);

  const expandBtn = document.createElement("button");
  expandBtn.textContent = "▼ Expand";
  expandBtn.className = "btn";
  expandBtn.onclick = () => toggleProducts(row);

  btnGroup.appendChild(settingsBtn);
  btnGroup.appendChild(expandBtn);

  header.appendChild(label);
  header.appendChild(btnGroup);
  header.appendChild(badge);

  const content = document.createElement("div");
  content.className = "promo-row-content";

  const discount = document.createElement("input");
  discount.type = "number";
  discount.placeholder = "Discount %";
  discount.className = "text-input discount-input";

  const pos = document.createElement("input");
  pos.placeholder = "Point of Sale";
  pos.className = "text-input";

  content.appendChild(discount);
  content.appendChild(pos);

  const productList = document.createElement("div");
  productList.className = "promo-products hidden";

  row.appendChild(header);
  row.appendChild(content);
  row.appendChild(productList);

  section.appendChild(row);
}

// --- SETTINGS MODAL ---
function openSettingsModal(row, badge) {
  let modal = document.getElementById("promo-settings-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "promo-settings-modal";
    modal.className = "modal hidden";
    modal.innerHTML = `
      <div class="modal-content">
        <h3>Row Filters</h3>
        <table id="filter-table">
          <thead>
            <tr><th>Field</th><th>Value</th><th></th></tr>
          </thead>
          <tbody id="filter-tbody"></tbody>
        </table>
        <button id="add-filter" class="btn">+ Add Filter</button>
        <div class="modal-actions">
          <button id="settings-cancel" class="btn">Cancel</button>
          <button id="settings-save" class="btn">Save</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }

  const tbody = modal.querySelector("#filter-tbody");
  tbody.innerHTML = "";

  const addFilterRow = async (prefill = {}) => {
    const tr = document.createElement("tr");

    const fieldTd = document.createElement("td");
    const fieldSelect = document.createElement("select");
    fieldSelect.className = "text-input";
    fieldSelect.innerHTML = `<option value="">-- choose field --</option>`;
    fieldMap.forEach((f) => {
      const opt = document.createElement("option");
      opt.value = f.name;
      opt.textContent = f.name;
      fieldSelect.appendChild(opt);
    });
    fieldTd.appendChild(fieldSelect);
    tr.appendChild(fieldTd);

    const valueTd = document.createElement("td");
    tr.appendChild(valueTd);

    const removeTd = document.createElement("td");
    const removeBtn = document.createElement("button");
    removeBtn.textContent = "×";
    removeBtn.className = "btn";
    removeBtn.onclick = () => tr.remove();
    removeTd.appendChild(removeBtn);
    tr.appendChild(removeTd);

    tbody.appendChild(tr);

    const renderValue = async () => {
      valueTd.innerHTML = "";
      const field = fieldMap.find((f) => f.name === fieldSelect.value);
      if (!field) return;

      if (field.fieldType === "List/Record") {
        const select = document.createElement("select");
        select.className = "text-input";
        const options = await getListOptions(field);
        options.forEach((opt) => {
          const o = document.createElement("option");
          o.value = opt["Internal ID"];
          o.textContent = opt["Name"];
          select.appendChild(o);
        });
        valueTd.appendChild(select);
      } else if (field.fieldType === "multiple-select") {
        const wrapper = document.createElement("div");
        wrapper.style.display = "flex";
        wrapper.style.flexDirection = "column";
        wrapper.style.gap = "4px";

        const search = document.createElement("input");
        search.type = "text";
        search.placeholder = "Search options…";
        search.className = "text-input";

        const select = document.createElement("select");
        select.multiple = true;
        select.className = "text-input";

        const modeToggle = document.createElement("select");
        modeToggle.className = "text-input";
        ["any", "all"].forEach((m) => {
          const opt = document.createElement("option");
          opt.value = m;
          opt.textContent = m.toUpperCase();
          modeToggle.appendChild(opt);
        });

        const options = await getListOptions(field);
        const renderOptions = (filter = "") => {
          select.innerHTML = "";
          options
            .filter((o) =>
              (o.Name || "").toLowerCase().includes(filter.toLowerCase())
            )
            .forEach((opt) => {
              const o = document.createElement("option");
              o.value = opt["Internal ID"];
              o.textContent = opt["Name"];
              select.appendChild(o);
            });
        };

        renderOptions();
        search.addEventListener("input", () => renderOptions(search.value));

        wrapper.appendChild(search);
        wrapper.appendChild(select);
        wrapper.appendChild(modeToggle);
        valueTd.appendChild(wrapper);
      } else if (field.fieldType === "Checkbox") {
        const select = document.createElement("select");
        select.className = "text-input";
        ["", "true", "false"].forEach((v) => {
          const o = document.createElement("option");
          o.value = v;
          o.textContent = v || "All";
          select.appendChild(o);
        });
        valueTd.appendChild(select);
      } else {
        const input = document.createElement("input");
        input.type = "text";
        input.className = "text-input";
        valueTd.appendChild(input);
      }

      if (prefill.field && prefill.field === fieldSelect.value) {
        if (field.fieldType === "multiple-select") {
          const wrapper = valueTd.querySelector("div");
          const select = wrapper.querySelector("select[multiple]");
          const modeToggle = wrapper.querySelector("select:not([multiple])");
          if (prefill.mode) modeToggle.value = prefill.mode;
          if (Array.isArray(prefill.ids)) {
            Array.from(select.options).forEach((o) => {
              if (prefill.ids.includes(o.value)) o.selected = true;
            });
          }
        } else {
          const input = valueTd.querySelector("input, select");
          if (input && prefill.value) input.value = prefill.value;
        }
      }
    };

    fieldSelect.addEventListener("change", () => renderValue());
    if (prefill.field) {
      fieldSelect.value = prefill.field;
      renderValue();
    }
  };

  const existingFilters = JSON.parse(row.dataset.filters || "[]");
  if (existingFilters.length) {
    existingFilters.forEach((f) => addFilterRow(f));
  } else {
    addFilterRow();
  }

  modal.querySelector("#add-filter").onclick = () => addFilterRow();
  modal.classList.remove("hidden");

  modal.querySelector("#settings-cancel").onclick = () =>
    modal.classList.add("hidden");

  modal.querySelector("#settings-save").onclick = () => {
    const filters = [];
    tbody.querySelectorAll("tr").forEach((tr) => {
      const field = tr.querySelector("select")?.value;
      const fieldDef = fieldMap.find((f) => f.name === field);
      if (!field) return;

      if (fieldDef?.fieldType === "multiple-select") {
        const wrapper = tr.querySelector("td:nth-child(2) div");
        const select = wrapper.querySelector("select[multiple]");
        const mode = wrapper.querySelector("select:not([multiple])")?.value || "any";
        if (select) {
          const ids = Array.from(select.selectedOptions).map((o) => o.value);
          filters.push({ field, ids, mode });
        }
      } else {
        let value = "";
        if (fieldDef?.fieldType === "List/Record" || fieldDef?.fieldType === "Checkbox") {
          const select = tr.querySelector("td:nth-child(2) select");
          if (select) value = select.value;
        } else {
          const input = tr.querySelector("td:nth-child(2) input");
          if (input) value = input.value;
        }
        if (value) filters.push({ field, value });
      }
    });

    row.dataset.filters = JSON.stringify(filters);

    if (filters.length > 0) {
      badge.textContent = `${filters.length} filter${filters.length > 1 ? "s" : ""}`;
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }

    modal.classList.add("hidden");
  };
}

// --- EXPAND PRODUCTS ---
function toggleProducts(row) {
  const list = row.querySelector(".promo-products");
  if (!list.classList.contains("hidden")) {
    list.classList.add("hidden");
    list.innerHTML = "";
    return;
  }

  const filters = JSON.parse(row.dataset.filters || "[]");
  const discountInput = row.querySelector(".discount-input");
  const discount = discountInput ? parseFloat(discountInput.value) || 0 : 0;

  const matched = fullData.filter((prod) =>
    filters.every((f) => {
      const field = fieldMap.find((fld) => fld.name === f.field);
      if (!field) return true;

      // List/Record or multiple-select fields (with feed)
      if (field.jsonFeed && (field.fieldType === "List/Record" || field.fieldType === "multiple-select")) {
        const options = listCache[field.name] || [];
        if (!options.length) return false;

        const prodVals = String(prod[f.field] || "")
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);

        const prodIds = prodVals
          .map((val) => {
            let match = options.find((opt) => (opt.Name || "").toLowerCase() === val);
            if (!match) {
              match = options.find((opt) => (opt.Name || "").toLowerCase().endsWith(val));
            }
            return match ? String(match["Internal ID"]) : null;
          })
          .filter(Boolean);

        const selectedIds = f.ids || (f.value ? [f.value] : []);
        if (!prodIds.length) return false;

        return f.mode === "all"
          ? selectedIds.every((id) => prodIds.includes(id))
          : selectedIds.some((id) => prodIds.includes(id));
      }

      // Checkbox
      if (field.fieldType === "Checkbox") {
        const val = String(prod[f.field]).toLowerCase();
        return f.value === "" || val === f.value.toLowerCase();
      }

      // Free-text fallback
      return String(prod[f.field] || "")
        .toLowerCase()
        .includes(String(f.value).toLowerCase());
    })
  );

  let html = `<h4>Matching Products (${matched.length})</h4>`;
  if (matched.length === 0) {
    html += "<p>No products match filters.</p>";
  } else {
    html += `<table class="promo-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Base Price</th>
          <th>Sale Price</th>
          <th class="ref-col">Base + VAT</th>
          <th class="ref-col">Sale + VAT</th>
        </tr>
      </thead>
      <tbody>`;
    matched.forEach((prod) => {
      const base = parseFloat(prod["Base Price"]) || 0;
      const sale = base * (1 - discount / 100);
      const baseVAT = base * 1.2;
      const saleVAT = sale * 1.2;

      html += `<tr>
        <td>${prod.Name}</td>
        <td>${base.toFixed(2)}</td>
        <td>${sale.toFixed(2)}</td>
        <td class="ref-col">${baseVAT.toFixed(2)}</td>
        <td class="ref-col">${saleVAT.toFixed(2)}</td>
      </tr>`;
    });
    html += `</tbody></table>`;
  }

  list.innerHTML = html;
  list.classList.remove("hidden");
}

// --- STYLES ---
const style = document.createElement("style");
style.textContent = `
  .promo-wrapper {
    max-width: 900px;
    margin: 30px auto;
  }
  .promo-title-wrap {
    margin-bottom: 20px;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .promo-title-input {
    flex: 1;
    padding: 6px 10px;
    font-size: 1rem;
    border: 1px solid #bbb;
    border-radius: 6px;
  }
  .promo-title-text {
    font-size: 1.5rem;
    font-weight: 600;
  }
  .promo-section {
    border: 1px solid #ddd;
    padding: 20px;
    margin: 25px 0;
    border-radius: 10px;
    background: #ffffff;
    box-shadow: 0 2px 6px rgba(0,0,0,0.08);
  }
  .promo-section-header {
    display: flex;
    gap: 10px;
    margin-bottom: 15px;
  }
  .promo-row {
    border: 1px solid #ccc;
    border-radius: 8px;
    background: #fff;
    margin-bottom: 12px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    overflow: hidden;
  }
  .promo-row-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #f4f6f8;
    padding: 8px 12px;
    border-bottom: 1px solid #ddd;
  }
  .promo-row-content {
    display: flex;
    gap: 10px;
    padding: 10px 12px;
  }
  .row-label {
    font-weight: 500;
    flex: 1;
  }
  .row-btn-group {
    display: flex;
    gap: 8px;
  }
  .filter-badge {
    font-size: 0.85rem;
    color: #fff;
    background: #2b7cff;
    padding: 2px 8px;
    border-radius: 12px;
    margin-left: 10px;
  }
  .promo-products {
    margin: 10px;
    padding: 8px;
    background: #fff;
    border: 1px solid #ddd;
    border-radius: 6px;
  }
  .promo-table {
    border-collapse: collapse;
    width: 100%;
    margin-top: 6px;
  }
  .promo-table th, .promo-table td {
    border: 1px solid #ddd;
    padding: 6px;
    text-align: left;
  }
  .promo-table th.ref-col,
  .promo-table td.ref-col {
    color: #888;
  }
  .btn {
    padding: 6px 10px;
    border: 1px solid #aaa;
    border-radius: 4px;
    cursor: pointer;
    background: #f9f9f9;
    transition: background 0.2s;
  }
  .btn:hover {
    background: #eee;
  }
  .btn.primary {
    background: #2b7cff;
    color: #fff;
    border-color: #2b7cff;
  }
  .btn.primary:hover {
    background: #1a5fd4;
  }
  .btn.small {
    padding: 4px 6px;
    font-size: 0.85rem;
  }
  .text-input {
    padding: 6px 8px;
    border: 1px solid #ccc;
    border-radius: 4px;
  }
  .hidden { display:none; }
  .modal { position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.4); display:flex; align-items:center; justify-content:center; z-index:999; }
  .modal.hidden { display:none; }
  .modal-content { background:#fff; padding:20px; border-radius:8px; min-width:400px; max-height:80vh; overflow:auto; }
  .modal-actions { margin-top:10px; display:flex; justify-content:flex-end; gap:10px; }
`;
document.head.appendChild(style);

// --- BOOTSTRAP ---
window.addEventListener("DOMContentLoaded", loadPromotionPage);
