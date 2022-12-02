const express = require("express");
const url = require('url');

const http = require('http');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const SessionStore = require('express-pg-session');
const WebSocket = require('ws');

var client = require("./_db");

var bodyParser = require('body-parser');

const app = express();
const urlencodedParser = express.urlencoded({extended: false});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public')); // статическое содержимое - в public, которая находится в корне проекта
app.use(cookieParser());

const EE = require("events").EventEmitter;
const messageEmitter = new EE();

var server = http.createServer(app);
var wss = new WebSocket.Server({ server });

server.listen(8181, function listening() {
    console.log('Listening on %d', server.address().port);
});

wss.on('connection', function connection(ws, req) {
    var location = url.parse(req.url, true);
    // You might use location.query.access_token to authenticate or share sessions
    // or req.headers.cookie (see http://stackoverflow.com/a/16395220/151312)
    console.log("new client connected");

    const callback = (message) => {
        console.log("in callback: message = " + message.data);
        //ws.send(message.data);
    }

    const on_authorization = (message) => {
        client.query("select * from public.user where login = $1 AND password = $2;", [message.data.login, message.data.password],
            function(err, rows){ 
                if (err){ 
                    console.log(err);
                    return;
                }
                console.log(rows);
                if (rows.rowCount == 1) {
                    ws.send(JSON.stringify({"cookie": "login="+message.data.login+"password="+message.data.password, "redirect":"list_of_problems.html"}));
                }
                else {
                    console.log("No such user: "+message.data.login);
                    ws.send(JSON.stringify({"cookie": "", "redirect":"sign_in.html"}));
                }
            }
        );
    }

    const on_registration = (message) => {
        client.query("select * from public.user where login = $1;", [message.data.login],
            function(err, rows){ 
                if (err){ 
                    console.log(err);
                    return;
                }
                console.log(rows);
                if (rows.rowCount == 1) {
                    console.log("such user has already existed: "+message.data.login+"\n");
                    ws.send(JSON.stringify({"cookie": "", "redirect":"sign_in.html"}));
                }
                else {
                    client.query("insert into public.user values($1, $2);", [message.data.login, message.data.password],
                        function(err, rows){ 
                            if (err){ 
                                console.log(err);
                                return;
                            }                            
                        }
                    );
                    ws.send(JSON.stringify({"cookie": "", "redirect":"sign_in.html"}));
                }
            }
        );
    }

    messageEmitter.on('authorization', on_authorization);
    messageEmitter.on('registration', on_registration);

    ws.on('message', function incoming(message) {
        console.log('received: %s', message);
        data = JSON.parse(message);
        messageEmitter.emit(data.status, {data: JSON.parse(message)});
    });

    ws.on('close', function close() {
        messageEmitter.off('newmessage', callback);
        console.log("client disconnected");
    })
});

/*app.post("/sign_in.html", urlencodedParser, function (request, response) {
    client.query("select * from user where login == $1 AND password == $2;", [request.body.login, request.body.password],
        function(err, rows){ 
            if (err){ 
                console.log(err);
                return;
            }
            console.log(rows);
            if (rows[0].cnt == 1) {
                res.writeHead(200, {
                    "Set-Cookie":"status=signed_up_user",
                    "Context-type":"text/plain"
                });
                res.redirect('/list_of_problems.html');
            }
            else {
                console.log("No such user");
            }
            response.end();
        }
    );
});*/

app.post("/sign_up.html", urlencodedParser, function (request, response) {
    client.query("select * from user where login = $1, password = $2;", [request.body.login, request.body.password],
        function(err, rows){ 
            if (err){ 
                console.log(err);
                return;
            }
            console.log(rows);
            if (rows[0].cnt == 1) {
                req.session.url = req.url;
                res.redirect('/sign_in.html');
            }
            else {
                client.query("insert into user values($1, $2);", [request.body.login, request.body.password],
                    function(err, rows){ 
                        if (err){ 
                            console.log(err);
                            return;
                        }
                        console.log(rows);
                        response.end();
                    });
            }
            response.end();
        }
    );
})

app.post("/form.html", urlencodedParser, function (request, response) {    
    response.writeHead(200, {
        "Set-Cookie":"testcookie=test",
        "Context-type":"text/plain"
    });
    res.end("Hello world");
    client.query("insert into list_of_problems values(default, $1, $2, $3);", [request.body.fio, request.body.phone, request.body.problem_desc],
        function(err, rows){ 
            if (err){ 
                console.log(err);
                return;
            }
            response.end();
        }
    );
});

app.get("/list_of_problems.html", function(req,res){
    res.writeHead(200, {
        "Set-Cookie":"testcookie=test",
        "Context-type":"text/plain"
    });
    client.query("select * from list_of_problems", function(err, rows){ 
        if (err){
            console.log(err); 
            return;
        }
        console.log(rows);
        res.end(JSON.stringify(rows));
    });        
});

app.listen(3000); //связали с портом и запустили сервер