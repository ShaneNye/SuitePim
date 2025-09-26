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
  {
    name: "Web Fabrics",
    SandboxUrl: "https://7972741-sb1.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=4071&deploy=1&compid=7972741_SB1&ns-at=AAEJ7tMQvzlM4oJsjY9bg35LIfIJ3beDV8rr9Zb87xgSVfh4vjM",
    ProdUrl: "https://7972741.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=4362&deploy=1&compid=7972741&ns-at=AAEJ7tMQuCblTEy2bK9e9ubRsyK1iJejSbpT0qKiF6gKlp70jQU"
  }, 
  {
    name: "Web Images",
    SandboxUrl: "https://7972741-sb1.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=4072&deploy=1&compid=7972741_SB1&ns-at=AAEJ7tMQJitxmFxKycziSYTCbda2g5B5wOaeadZmInVwV2x4its",
    ProdUrl: "https://7972741.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=4363&deploy=1&compid=7972741&ns-at=AAEJ7tMQj7nwNmk-xPekCtRHeFZqWvqHsTMC61_Fm5CUtqC4tJM"
  }
];


// Determine environment
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

// --- Field Map ---

// == product Development fields //
export const fieldMap = [
  { name: "Internal ID", disableField: true},
  { name: "Name", internalid: "itemid", fieldType: "Free-Form Text", disableField: true},
  { name: "Display Name", internalid: "displayname", fieldType: "Free-Form Text" },
  { name: "Supplier Name", internalid: "vendorname", fieldType: "Free-Form Text" },
  { name: "Class", internalid: "class", fieldType: "List/Record", jsonFeed: urlFor("Class") },
  { name: "Purchase Price", internalid: "cost", fieldType: "Currency" },
  { name: "Base Price", internalid: "price", fieldType: "Currency" },
  { name: "Sub-Class", internalid: "custitem_sb_sub_class", fieldType: "List/Record", jsonFeed: urlFor("Sub-Class") },
  { name: "Lead Time", internalid: "custitem_sb_leadtime_ltd", fieldType: "List/Record", jsonFeed: urlFor("Lead Time") },
  { name: "Preferred Supplier", internalid: "vendor", fieldType: "List/Record", jsonFeed: urlFor("Preferred Supplier"),},
  { name: "Inactive", internalid: "isinactive", fieldType: "Checkbox" },
  { name: "Is Parent", internalid: "parent", fieldType: "Checkbox" },
  { name: "NS record", internalid: "nsrecord", fieldType: "Link", disableField: true },
  {name: "Record Type", internalid:"type ", fieldType: "Free-Form Text", disableField: true},
  {name: "Size", disableField: true},
  ///////////////////////
  /* WEB FIELD MAPPING */
  ////////////////////
  {name: "Category", internalid: "custitem_sb_category", fieldType: "multiple-select", jsonFeed: urlFor("Class")},
  {name: "Fabric", internalid: "custitem_sb_web_fabric_swatch", fieldType: "multiple-select", jsonFeed: urlFor("Web Fabrics")},
  {name: "Woo ID", internalid: "custitem_magentoid", fieldType: "Free-Form Text", disableField: true},
  // Imagery mapping //
  {name: "Catalogue Image One", internalid: "custitem_sb_cat_img_one", fieldType: "image", jsonFeed: urlFor("Web Images")},
  {name: "Catalogue Image Two", internalid:"custitem_sb_cat_img_two", fieldType: "image", jsonFeed: urlFor("Web Images")},
  {name: "Catalogue Image Three", internalid: "custitem_sb_cat_img_three", fieldType: "image", jsonFeed: urlFor("Web Images")},
  {name: "Catalogue Image Four", internalid: "custitem_sb_cat_img_four", fieldType: "image", jsonFeed: urlFor("Web Images")},
  {name: "Catalogue Image Five", internalid: "custitem_sb_cat_img_five", fieldType: "image", jsonFeed: urlFor("Web Images")},
  {name: "Item Image", internalid: "custitem_atlas_item_image", fieldType: "image", jsonFeed: urlFor("Web Images")},
  // Imagery Mapping End // 
  {name: "Colour Filter", internalid: "custitem_sb_colour", fieldType: "Free-Form Text"},
  {name: "Fillings", internalid: "custitem_sb_fillings", fieldType: "Free-Form Text"},
  {name: "Length", internalid: "custitem_sb_length", fieldType: "Free-Form Text"},
  {name: "Turnable", internal: "custitem_sb_turnable", fieldType: "Free-Form Text"},
  {name: "Country Of Origin", internalid: "custitem_sb_country_of_origin", fieldType: "Free-Form Text"},
  {name: "Head End Height", internalid: "custitem_sb_head_height", fieldType: "Free-Form Text"},
  {name: "Spring Type", internalid: "custitem_sb_spring_type", fieldType: "Free-Form Text"},
  {name: "Warranty", internalid: "custitem_sb_warranty", fieldType: "Free-Form Text"},
  {name: "Standard-Sizes", internalid: "custitem_sb_standard_sizes", fieldType: "Free-Form Text"},
  {name: "Tags", internalid: "custitem_sb_tags", fieldType: "Free-Form Text", disableField: false},
  {name: "Depth", internalid: "custitem_sb_depth", fieldType: "Free-Form Text"},
  {name: "Height", internalid: "custitem_sb_height", fieldType: "Free-Form Text"},
  {name: "Width", internalid: "custitem_sb_width", fieldType: "Free-Form Text"},
  {name: "Storage", internalid: "custitem_sb_storage", fieldType: "Free-Form Text"}, 
  {name: "Built/Flat Packed", internalid: "custitem_sb_built_flat_packed", fieldType: "Free-Form Text"},
  {name: "Dimension Unit", internalid: "custitem_sb_dimension_unit", fieldType: "Free-Form Text"},
  {name: "Surface", internalid: "custitem_sb_surface", fieldType: "Free-Form Text"},
  {name: "Type", internalid: "custitem_sb_type", fieldType: "Free-Form Text"},
  {name: "Comfort", internalid: "custitem_sb_comfort", fieldType: "Free-Form Text"},
  // Dynmaic fields //
  {name: "Online?", internalid: "", fieldType: "Checkbox", disableField: true},
  {name: "Short Description", internalid:"storedescription", fieldType: "rich-text"},
  {name: "Detailed Description", internalid:"storedetaileddescription", fieldType: "rich-text"}
  

];
