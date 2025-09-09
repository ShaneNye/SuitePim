/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 */

define(['N/record', 'N/runtime', 'N/search', 'N/log'],
    (record, runtime, search, log) => {

        const execute = (scriptContext) => {
            try {
                log.debug({ title: 'Script Start', details: 'Scheduled script execution started' });

                // Load the saved search for Sales Orders
                let mySearch = search.load({ id: 'customsearch_sb_sales_with_alt_issues_2' });

                let searchResultCount = 0;
                mySearch.run().each(result => {
                    searchResultCount++;
                    let salesOrderId = result.getValue('internalid');
                    let lineItemId = result.getValue('item');
                    let lineAltSalesAmt = result.getValue({ name: 'formulacurrency' }); // Get the explicit formula currency field

                    log.debug({ title: 'Processing Line Item', details: `Sales Order ID: ${salesOrderId}, Item ID: ${lineItemId}, Alt Sales Amt: ${lineAltSalesAmt}` });

                    try {
                        let salesOrderRec = record.load({
                            type: record.Type.SALES_ORDER,
                            id: salesOrderId,
                            isDynamic: true
                        });

                        let lineCount = salesOrderRec.getLineCount({ sublistId: 'item' });
                        for (let i = 0; i < lineCount; i++) {
                            let currentItemId = salesOrderRec.getSublistValue({ sublistId: 'item', fieldId: 'item', line: i });
                            if (currentItemId == lineItemId) {
                                // Log current alt sales amount before updating
                                let currentAltSalesAmt = salesOrderRec.getSublistValue({ sublistId: 'item', fieldId: 'altsalesamt', line: i });
                                log.debug({
                                    title: `Current Alt Sales Amt`,
                                    details: `Current Alt Sales Amt for Item ID ${currentItemId}: ${currentAltSalesAmt}`
                                });

                                salesOrderRec.selectLine({ sublistId: 'item', line: i });
                                salesOrderRec.setCurrentSublistValue({
                                    sublistId: 'item',
                                    fieldId: 'altsalesamt', // Updating alt sales amount
                                    value: lineAltSalesAmt
                                });

                                // Log updated alt sales amount after setting
                                log.debug({
                                    title: `Updated Alt Sales Amt`,
                                    details: `Updated Alt Sales Amt for Item ID ${currentItemId}: ${lineAltSalesAmt}`
                                });

                                salesOrderRec.commitLine({ sublistId: 'item' });
                            }
                        }

                        salesOrderRec.save({
                          enableSourcing: false,
                          ignoreMandatoryFields: true
                        });
                        log.debug({ title: 'Sales Order Updated', details: `Updated Sales Order ID: ${salesOrderId}` });
                    } catch (updateError) {
                        log.error({ title: 'Error Updating Sales Order', details: updateError });
                    }

                    return true; // Continue iteration
                });

                log.debug({ title: 'Script Complete', details: `Processed ${searchResultCount} sales order lines.` });

            } catch (error) {
                log.error({ title: 'Error', details: error });
            }
        };

        return { execute };
    });
