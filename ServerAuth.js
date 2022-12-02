const express = require("express");
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const SessionStore = require('express-mysql-session');
const connection = require("./db");
const app = express();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));
app.use(cookieParser());

const options = {
    host: 'localhost',
    user: 'alex',
    password: 'Qwerty123',
    database: 'world'
};


app.use(session({
    key: 'session_cookie_name_auth',
    secret: 'session_cookie_secret',
    store: new SessionStore(options),
    resave: true,
    saveUninitialized: true
}))


function checkUser(req, res, next) {
    if (req.session.user_id) {
        connection.query("select count(*) cnt from users where user_name=? and passwd=?", [req.session.user_id,req.session.password], function(err, rows){
            if (err){
                console.log(err);
                return;
            }
            if (rows[0].cnt == 1) next();
            else {
                req.session.url = req.url;
                res.redirect('/login.html');
            }
        });
    } else {
        req.session.url = req.url;
        res.redirect('/login.html');
    }
}



app.get('/topsecret/:document', checkUser, function(req, res) {
    res.end("Вы получили доступ к секретным данным "+ req.params.document);
});

app.post('/session/create', function(req, res) {
    req.session.user_id = req.body.login;
    req.session.password = req.body.password;

    if (req.session.url)
        res.redirect(req.session.url);
});

app.get('/session/del', function(req, res) {
    if (req.session) {
        req.session.destroy(function() {});
    }
    res.end("Session deleted");
});



app.listen(3000);