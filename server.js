/* internal modules */
var http = require('http');
var fs = require('fs');

/* external modules */
var qs = require('query-string');
var mongodb = require('mongodb');
var cookies = require('cookies');
var uuid = require('uuid');
var WebSocket = require('ws');

/* own modules */
var lib = require('./lib');
var common = require('./common');
var rest = require('./rest');

/* configuration */
var config = {};
try {
    var content = fs.readFileSync('config.json');
    config = JSON.parse(content);
} catch(ex) {
    console.error(ex.message);
    process.exit(1);
}

/* HTTP server */
var httpServer = http.createServer();

httpServer.on('request', function (req, rep) {
    var appCookies = new cookies(req, rep);
    var session = appCookies.get('session');
    var now = Date.now();
    if(!session || !common.sessions[session]) {
        session = uuid();
        common.sessions[session] = { from: req.connection.remoteAddress, created: now, touched: now };
    } else {
        common.sessions[session].from = req.connection.remoteAddress;
        common.sessions[session].touched = now;    
    }
    appCookies.set('session', session, { httpOnly: false });

    console.log('<<< ' + req.method + ' ' + req.url + ' [' + session + ']');

    var parsedUrl = qs.parseUrl(req.url);
    if(req.method == 'POST' || req.method == 'PUT') {
        /* requests with payload will be redirected to rest */
        lib.payload2JSON(req, rep, function(req, rep, payload, err) {
            if(err) {
                lib.sendJSONWithError(rep, 400, err.text);
            } else {
                rest(parsedUrl.url, req, rep, parsedUrl.query, payload, session);
            }
        });
        return;
    }

    switch(parsedUrl.url) {

        /* static content server */
        case '/':
            lib.serveStaticContent(rep, 'html/index.html'); break;
        case '/favicon.ico':
            lib.serveStaticContent(rep, 'img/favicon.ico'); break;
        default:
            /* file server */
            if(/^\/(html|css|js|fonts|img)\//.test(parsedUrl.url)) {
                lib.serveStaticContent(rep, '.' + parsedUrl.url);
            } else {
                /* not static content, try rest without payload */
                rest(parsedUrl.url, req, rep, parsedUrl.query, null, session);
            }
    }

});

common.ws = new WebSocket.Server({ server: httpServer });

common.ws.on('connection', function connection(conn) {
	conn.on('message', function(data) {
        console.log('<<< retrieving data from websocket: ' + data);
        try {
            var message = JSON.parse(data);
            rep = { action: message.action, text: message.text };
            switch(message.action) {
                case 'init':
                    if(message.session && common.sessions[message.session]) {
                        console.log('Session ids consistent, websocket initialization for session ' + message.session);
                        common.sessions[message.session].ws = conn;
                        conn.session = message.session;
                    }
                    break;
                default:
                    console.log('Unknown action sent from websocket: ' + message.action);
            }
        } catch(ex) {
            console.log('Invalid message from websocket: ' + data);
            console.log('error:' + ex);
        }
        try {
            conn.send(JSON.stringify(rep));
        } catch(ex) {
            console.error('WebSocket error while sending initialization response');
        }
	}); 
});

/* main */

/* uncomment below to handling uncaught exceptions */
// process.on('uncaughtException', function(err) {
//     console.error('Runtime error ' + err.code + ' in the function \'' + err.syscall + '\'');
//     process.exit(1);
// });

mongodb.MongoClient.connect(config.db, { useNewUrlParser: true, useUnifiedTopology: true }, function(err, conn) {
    if(err) {
        console.error('Connection to ' + config.db + ' failed: ' + err.name);
        process.exit(2);
    }
    var db = conn.db(config.dbName);
    common.accounts = db.collection('accounts');
    common.history = db.collection('history');
    common.templates = db.collection('templates');
    console.log('Connection with ' + config.db + ' established');
    httpServer.listen(config.port);
    console.log("HTTP server is listening on the port " + config.port);
});
