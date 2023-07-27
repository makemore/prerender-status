const fs = require('fs');
const path = require('path');
const http = require('http');
const util = require('./util');
const basename = path.basename;
const server = require('./server');
const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const compression = require('compression');


var REDIS_URL = process.env.REDISTOGO_URL ||
    process.env.REDISCLOUD_URL ||
    process.env.REDISGREEN_URL ||
    process.env.REDIS_URL ||
    'redis://127.0.0.1:6379';

var url = require('url');
var TTL = process.env.PAGE_TTL || 86400;

// Parse out the connection vars from the env string.
var connection = url.parse(REDIS_URL);
var redis = require('redis');
var client = redis.createClient(connection.port, connection.hostname);
var redisOnline = false;

var STATUS_CODES_TO_CACHE = {
    200: true,
    203: true,
    204: true,
    206: true,
    300: true,
    301: true,
    404: true,
    405: true,
    410: true,
    414: true,
    501: true
};

// Parse out password from the connection string
if (connection.auth) {
    client.auth(connection.auth.split(':')[1]);
}

// Make redis connection
// Select Redis database, parsed from the URL
connection.path = (connection.pathname || '/').slice(1);
connection.database = connection.path.length ? connection.path : '0';
client.select(connection.database);

// Catch all error handler. If redis breaks for any reason it will be reported here.
client.on('error', function (error) {
    console.warn('Redis Cache Error: ' + error);
});

client.on('ready', function () {
    redisOnline = true;
    console.log('Redis Cache Connected');
});

client.on('end', function () {
    redisOnline = false;
    console.warn(
        'Redis Cache Conncetion Closed. Will now bypass redis until it\'s back.'
    );
});


exports = module.exports = (options = {
    logRequests: process.env.PRERENDER_LOG_REQUESTS === 'true'
}) => {
    const parsedOptions = Object.assign({}, {
        port: options.port || process.env.PORT || 3000
    }, options)

    server.init(options);
    server.onRequest = server.onRequest.bind(server);

    app.disable('x-powered-by');
    app.use(compression());


    app.get("/status/", function (req, res) {

        print("in status")

        client.get(req.query.url, function (error, result) {
            if (!error && result) {
                var response = JSON.parse(result);
                var headers = response.headers;
                //var key;

                console.log(response);
                console.log(headers);
                // for (key in headers) {
                //     if (headers.hasOwnProperty(key) && !/[^\t\x20-\x7e\x80-\xff]/.test(headers[key])) {
                //         res.setHeader(key, headers[key]);
                //     }
                // }
                res.sendStatus(200);
            } else {
                res.sendStatus(404);
            }
        });



    });

    app.get('*', server.onRequest);

    //dont check content-type and just always try to parse body as json
    app.post('*', bodyParser.json({type: () => true}), server.onRequest);

    app.listen(parsedOptions, () => util.log(`Prerender server accepting requests on port ${parsedOptions.port}`))

    return server;
};

fs.readdirSync(__dirname + '/plugins').forEach((filename) => {
    if (!/\.js$/.test(filename)) return;

    var name = basename(filename, '.js');

    function load() {
        return require('./plugins/' + name);
    };

    Object.defineProperty(exports, name, {
        value: load
    });
});
