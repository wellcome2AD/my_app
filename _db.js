var pg = require('pg');
var conString = "postgres://postgres:1234@localhost:5432/my_app";

var client = new pg.Client(conString);
client.connect();

module.exports = client;
