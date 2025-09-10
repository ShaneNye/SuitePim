// public/js/fieldMap.js

// --- Environment-aware URL map ---
const mapenvironment = [
  {
    name: "Class",
    SandboxUrl:
      "https://7972741-sb1.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=4060&deploy=1&compid=7972741_SB1&ns-at=AAEJ7tMQSZ9m0red-oo6DXPZPPXnRO-GNulE24ElPN_mylZzPFY",
    ProdUrl:
      "https://7972741.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=4350&deploy=1&compid=7972741&ns-at=AAEJ7tMQ6gXGb-vnNauhwWeEKPyMbLqQq-2k6SDvSApCCp3oiUg",
  },
  {
    name: "Sub-Class",
    SandboxUrl:
      "https://7972741-sb1.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=4060&deploy=1&compid=7972741_SB1&ns-at=AAEJ7tMQSZ9m0red-oo6DXPZPPXnRO-GNulE24ElPN_mylZzPFY",
    ProdUrl:
      "https://7972741.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=4350&deploy=1&compid=7972741&ns-at=AAEJ7tMQ6gXGb-vnNauhwWeEKPyMbLqQq-2k6SDvSApCCp3oiUg",
  },
  {
    name: "Lead Time",
    SandboxUrl:
      "https://7972741-sb1.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=4061&deploy=1&compid=7972741_SB1&ns-at=AAEJ7tMQunqZrTigLdKbwNR8zugyPk-_c97Orrg3Yvclxq_J3Uo",
    ProdUrl:
      "https://7972741.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=4351&deploy=1&compid=7972741&ns-at=AAEJ7tMQ_OGgGdPJmObcIQ9bLUboSg_5qESl552MtD_LV0iaFyo",
  },
  {
    name: "Preferred Supplier",
    SandboxUrl:
      "https://7972741-sb1.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=4062&deploy=1&compid=7972741_SB1&ns-at=AAEJ7tMQuVVpxBhFJ_f9Mh1J1yh-lhszFd2X9-tT7ZaadZ_fTkw",
    ProdUrl:
      "https://7972741.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=4352&deploy=1&compid=7972741&ns-at=AAEJ7tMQMfdQuRFm3vrD69S7SrazDWZtpj-3h8yWEw-pEo7xJpM",
  },
];

// Determine environment safely (browser vs server)
function currentEnvironment() {
  // Browser: use localStorage set at login
  if (typeof window !== "undefined" && window.localStorage) {
    return (localStorage.getItem("environment") || "Sandbox").toLowerCase();
  }
  // Server: optional env var for SSR/imports; else default Sandbox
  if (typeof process !== "undefined" && process.env?.SUITEPIM_ENV) {
    return String(process.env.SUITEPIM_ENV).toLowerCase();
  }
  return "sandbox";
}

// Resolve feed URL for a given map name
function urlFor(name) {
  const entry = mapenvironment.find((m) => m.name === name);
  if (!entry) return "";
  return currentEnvironment() === "production" ? entry.ProdUrl || "" : entry.SandboxUrl || "";
}

// --- Exported field map (shape unchanged) ---
export const fieldMap = [
  { name: "Name", internalid: "itemid", fieldType: "Free-Form Text" },
  { name: "Display Name", internalid: "displayname", fieldType: "Free-Form Text" },
  { name: "Supplier Name", internalid: "vendorname", fieldType: "Free-Form Text" },

  { name: "Class", internalid: "class", fieldType: "List/Record", jsonFeed: urlFor("Class") },
  { name: "Purchase Price", internalid: "cost", fieldType: "Currency" },
  { name: "Base Price", internalid: "price", fieldType: "Currency" },

  { name: "Sub-Class", internalid: "custitem_sb_sub_class", fieldType: "List/Record", jsonFeed: urlFor("Sub-Class") },
  { name: "Lead Time", internalid: "custitem_sb_leadtime_ltd", fieldType: "List/Record", jsonFeed: urlFor("Lead Time") },
  { name: "Preferred Supplier", internalid: "vendor", fieldType: "List/Record", jsonFeed: urlFor("Preferred Supplier") },

  { name: "inactive", internalid: "isinactive", fieldType: "Checkbox" },
];
