function recalcRow(row, changedField = null) {
  const updated = { ...row };

  const VAT = 0.2; // 20% VAT
  let P = parseFloat(updated["Purchase Price"]) || 0;
  let B = parseFloat(updated["Base Price"]) || 0;
  let R = parseFloat(updated["Retail Price"]) || 0;
  let M = parseFloat(updated["Margin"]) || 0;

  switch (changedField) {
    case "Purchase Price":
      if (P > 0 && R > 0) {
        M = R / P; // only recalc margin
      }
      break;

    case "Base Price":
      if (B > 0) {
        R = B * (1 + VAT);
        if (P > 0) M = R / P;
      }
      break;

    case "Retail Price":
      if (R > 0) {
        B = R / (1 + VAT);
        B = parseFloat(B.toFixed(2));
        if (P > 0) M = R / P;
      }
      break;

    case "Margin":
      if (P > 0 && M > 0) {
        R = P * M;
        B = R / (1 + VAT);
        B = parseFloat(B.toFixed(2));
      }
      break;

    default:
      if (B > 0) {
        R = B * (1 + VAT);
        if (P > 0) M = R / P;
      }
  }

  updated["Purchase Price"] = P.toFixed(2);
  updated["Base Price"] = B.toFixed(2);
  updated["Retail Price"] = Math.round(R);
  updated["Margin"] = M.toFixed(1);

  return updated;
}


// --- Tools (use recalcRow for consistency) ---
function addRetailPriceTool(data) { return data.map(r => recalcRow(r)); }
function addMarginTool(data)      { return data.map(r => recalcRow(r)); }

// ✅ Attach globally
window.recalcRow = recalcRow;
window.addRetailPriceTool = addRetailPriceTool;
window.addMarginTool = addMarginTool;
window.toolColumns = ["Retail Price", "Margin"];
