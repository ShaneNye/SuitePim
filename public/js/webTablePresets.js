export const webTablePresets = [
  {
    name: "Web Description",
    fields: ["Internal Id", "Name", "New Feature Desc", "reasons to buy", "Iframe URL"],
    filters: [
      { field: "Is Parent", value: "true" },
      { field: "Inactive", value: "false" }
    ]
  },
  {
    name : "Mattress Metrics",
    fields : ["Internal Id", "Name", "Comfort", "Type", "Depth", "Fillings", "Height", "Width","Length","Spring Type"],
    filters : [
      { field: "Class", value: "Mattress" },
      { field: "Inactive", value: "false" }
    ]
  },
  {
    name : "Bed Frame Metrics",
    fields: ["Internal Id", "Name", "Type", "Built/Flat Packed", "Colour Filter", "Depth", "Head End Height", "Height", "Width", "Length", "Storage"],
    filters : [
     { field: "Class", value: "Bed Frames" },
      { field: "Inactive", value: "false"}
    ]
    },
    {
        name : "Imagery",
        fields : ["Intenal Id", "Name", "Catalogue Image One", "Catalogue Image Two", "Catalogue Image Three", "Catalogue Image Four", "Catalogue Image Five", "Item Image"],
        filters : [
            { field: "Inactive", value: "false" },
        ]
    },
    {
        name : "Meta Data",
        fields: ["Internal Id", "Name", "Category", "Tags", "Lead Time"],
        filters : [
            { field: "Inactive", value: "false" },
        ]
    }
];
