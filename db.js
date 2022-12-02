const db = require("mysql");
const connection = db.createConnection({
    host: "localhost",
    user: "alex",
    password: "Qwerty123",
    database: "world"
});

connection.connect(function(err){
    if (err) {
        console.log(err);
        return;
    }
    console.log("connection established");
})






module.exports = connection;