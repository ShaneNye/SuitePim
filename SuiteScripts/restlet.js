/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 */
define([], function() {

    function get(requestParams) {
        return {
            message: "RESTlet is working!",
            params: requestParams
        };
    }

    function post(requestBody) {
        return {
            message: "POST received!",
            body: requestBody
        };
    }

    return {
        get: get,
        post: post
    };
});
