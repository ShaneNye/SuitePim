/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
define(['N/record'], (record) => {
  const onRequest = (context) => {
    if (context.request.method === 'GET' || context.request.method === 'POST') {
      try {
        const params = context.request.parameters;
        const itemId = params.itemid;        // Inventory Item internal ID
        const fileId = params.fileid;        // File Cabinet internal ID of image
        const fieldId = params.fieldid;      // e.g. "custitem_sb_cat_img_one"

        if (!itemId || !fileId || !fieldId) {
          throw new Error('Missing required parameters: itemid, fileid, fieldid');
        }

        // Load the item
        const rec = record.load({
          type: record.Type.INVENTORY_ITEM,
          id: itemId,
          isDynamic: true,
        });

        // Set the image field
        rec.setValue({
          fieldId: fieldId,
          value: parseInt(fileId, 10),
        });

        const savedId = rec.save();

        context.response.write({
          output: JSON.stringify({
            success: true,
            message: `Image updated successfully`,
            recordId: savedId,
          }),
        });
      } catch (e) {
        log.error('Suitelet error', e);
        context.response.write({
          output: JSON.stringify({
            success: false,
            message: e.message,
          }),
        });
      }
    } else {
      context.response.write('Only GET/POST supported');
    }
  };

  return { onRequest };
});
