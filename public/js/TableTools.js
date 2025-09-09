// TableTools.js

// --- Tool: Retail Price ---
function addRetailPriceTool(data) {
    return data.map(row => {
        const base = parseFloat(row["Base Price"]);
        if (!isNaN(base)) {
            // Calculate (BASE PRICE / 100) * 120
            row["Retail Price"] = ((base / 100) * 120).toFixed(0);
        } else {
            row["Retail Price"] = "";
        }
        return row;
    });
}

// --- Tool: Margin ---
function addMarginTool(data) {
    return data.map(row => {
        const retail = parseFloat(row["Retail Price"]);
        const purchase = parseFloat(row["Purchase Price"]);

        if (!isNaN(retail) && !isNaN(purchase) && purchase > 0) {
            // One decimal place
            row["Margin"] = (retail / purchase).toFixed(1);
        } else {
            row["Margin"] = "";
        }
        return row;
    });
}

// ✅ Attach globally so ProductData.js can use
window.addRetailPriceTool = addRetailPriceTool;
window.addMarginTool = addMarginTool;

// ✅ Identify tool columns
window.toolColumns = ["Retail Price", "Margin"];
