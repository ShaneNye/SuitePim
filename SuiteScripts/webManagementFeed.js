/**
 * @NApiVersion 2.x
 * @NScriptType Suitelet
 */
define(['N/search'], function(search) {

    function onRequest(context) {
        var request = context.request;
        var response = context.response;

        // Set CORS headers for all responses
        function setCORSHeaders() {
            response.setHeader({ name: 'Access-Control-Allow-Origin', value: '*' });
            response.setHeader({ name: 'Access-Control-Allow-Methods', value: 'GET, POST, OPTIONS' });
            response.setHeader({ name: 'Access-Control-Allow-Headers', value: 'Content-Type' });
            response.setHeader({ name: 'Content-Type', value: 'application/json' });
        }

        setCORSHeaders();

        // Handle preflight OPTIONS request
        if (request.method === 'OPTIONS') {
            response.write(JSON.stringify({ status: 'ok' }));
            return;
        }

        try {
            var mySearch = search.load({ id: 'customsearch_sb_sp_web_management' }); // ✅ updated search ID
            var jsonData = [];
            var start = 0;
            var batchSize = 1000;
            var results;

            do {
                results = mySearch.run().getRange({ start: start, end: start + batchSize });

                results.forEach(function(result) {
                    var rowObj = {};
                    result.columns.forEach(function(col) {
                        var key = col.label || col.name || col.id; // fallback to id
                        var value = result.getText(col) || result.getValue(col) || null;
                        rowObj[key] = value;
                    });
                    jsonData.push(rowObj);
                });

                start += batchSize;
            } while (results.length === batchSize);

            response.write(JSON.stringify(jsonData));

        } catch (e) {
            response.write(JSON.stringify({ error: e.message }));
        }
    }

    return {
        onRequest: onRequest
    };
});
