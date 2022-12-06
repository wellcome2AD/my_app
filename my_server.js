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

var server = http.createServer(app);
var wss = new WebSocket.Server({ server }, webSockets = {});

server.listen(8181, function listening() {
    console.log('Listening on %d', server.address().port);
});

wss.on('connection', function connection(ws, req) {
    const messageEmitter = new EE();

    var location = url.parse(req.url, true);
    // You might use location.query.access_token to authenticate or share sessions
    // or req.headers.cookie (see http://stackoverflow.com/a/16395220/151312)
    console.log("new client connected");
    var pageName = req.url
    if (pageName in webSockets) {
        webSockets[pageName].push(ws)
    }
    else {
        webSockets[pageName] = [ws]
    }
    console.log('connected: ' + pageName + ' in ' + Object.getOwnPropertyNames(webSockets))

    const callback = (message) => {
        console.log("in callback: message = " + message.data);
        //ws.send(message.data);
    }

    const on_authorization = (message) => {
        client.query("SELECT * FROM public.user WHERE login LIKE $1 AND password LIKE $2;", [message.data.login, message.data.password],
            function(err, rows){ 
                if (err){ 
                    console.log(err);
                    return;
                }
                console.log(rows);
                if (rows.rowCount == 1) {
                    ws.send(JSON.stringify({"cookie": "login="+message.data.login+";password="+message.data.password, "redirect":"list_of_problems.html"}));
                }
                else {
                    console.log("No such user: "+message.data.login);
                    ws.send(JSON.stringify({"cookie": "", "redirect":"sign_in.html"}));
                }
            }
        );
    }

    const on_registration = (message) => {
        client.query("SELECT * FROM public.user WHERE login LIKE $1;", [message.data.login],
            function(err, rows){ 
                if (err){ 
                    console.log(err);
                    return;
                }
                console.log(rows);
                if (rows.rowCount == 1) {
                    console.log("such user already exists: "+message.data.login+"\n");
                    ws.send(JSON.stringify({"cookie": "", "redirect":"sign_in.html"}));
                }
                else {
                    client.query("INSERT INTO public.user VALUES($1, $2);", [message.data.login, message.data.password],
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

    const on_new_problem = (message) => {
        client.query("insert into list_of_problems values(default, $1, $2, $3, default);", [message.data.fio, message.data.phone, message.data.problem_desc],
            function(err, rows){ 
                if (err){ 
                    console.log(err);
                    return;
                }
                console.log(rows);
            });
        
        const key_to_send = "/list_of_problems.html";
        if(key_to_send in webSockets)
        {
            client.query("select * from list_of_problems", function(err, rows){ 
                if (err){
                    console.log(err); 
                    return;
                }
                console.log(rows);
                for(var ws_to_send in webSockets[key_to_send]) {
                    webSockets[key_to_send][ws_to_send].send(JSON.stringify(rows));
                }
            });
        }
    }

    messageEmitter.on('authorization', on_authorization);
    messageEmitter.on('registration', on_registration);
    messageEmitter.on('new_problem', on_new_problem);

    ws.on('message', function incoming(message) {
        console.log('received: %s', message);
        data = JSON.parse(message);
        messageEmitter.emit(data.status, {data: JSON.parse(message)});
    });

    ws.on('close', function close() {
        console.log("client disconnected");
        messageEmitter.off('authorization', on_authorization);
        messageEmitter.off('registration', on_registration);
        messageEmitter.off('new_problem', on_new_problem);
        for(var key in webSockets)
        {
            const index = webSockets[key].indexOf(ws);
            if (index > -1) { // only splice array when item is found
                webSockets[key].splice(index, 1); // 2nd parameter means remove one item only
                break;
            }

        }
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

/*app.post("/sign_up.html", urlencodedParser, function (request, response) {
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
    client.query("insert into list_of_problems values(default, $1, $2, $3, default);", [request.body.fio, request.body.phone, request.body.problem_desc],
        function(err, rows){ 
            if (err){ 
                console.log(err);
                return;
            }
            response.end();
        }
    );
});*/

app.get("/list_of_problems.html", function(req,res){
    var cookie = req.cookies;
    if(cookie.login != undefined && cookie.password != undefined) 
    {
        client.query("SELECT id, role FROM public.user WHERE login LIKE $1 AND password LIKE $2;", [cookie.login, cookie.password], function(err, rows){ 
            if (err){
                console.log(err); 
                return;
            }
            console.log(rows);
            if(rows.rowCount != 0) {
                var role = rows.rows[0].role;
            var id = rows.rows[0].id;
            if(role == "admin")
            {
                client.query("SELECT * FROM list_of_problems WHERE is_done = false;", function(err, rows){ 
                    if (err){
                        console.log(err); 
                        return;
                    }
                    console.log(rows);
                    res.end(JSON.stringify(rows));
                });
            }
            else if(role == "employee")
            {                
                client.query("SELECT problem_id, problem_desc, is_done, comment " +
                              "FROM task_distrib " +
                              "JOIN list_of_problems ON (problem_id = list_of_problems.id) " +
                              "WHERE (task_distrib.employee_id = $1);", [id],
                    function(err, rows){ 
                        if (err){
                            console.log(err); 
                            return;
                        }
                        console.log(rows);
                        res.end(JSON.stringify(rows));
                    });
            }
            else if(role == 'user')
            {
                client.query("SELECT * FROM list_of_problems WHERE (user_id = $1);", [id], function(err, rows){ 
                    if (err){
                        console.log(err); 
                        return;
                    }
                    console.log(rows);
                    res.end(JSON.stringify(rows));
                });
            }
            else
            {
                client.query("SELECT * FROM list_of_problems;", function(err, rows){ 
                    if (err){
                        console.log(err); 
                        return;
                    }
                    console.log(rows);
                    res.end(JSON.stringify(rows));
                });
            }
            }
            else {
                client.query("SELECT * FROM list_of_problems;", function(err, rows){ 
                    if (err){
                        console.log(err); 
                        return;
                    }
                    console.log(rows);
                    res.end(JSON.stringify(rows));
                });
            }
        });
    }
    else {
        client.query("SELECT * FROM list_of_problems;", function(err, rows){ 
            if (err){
                console.log(err); 
                return;
            }
            console.log(rows);
            res.end(JSON.stringify(rows));
        });
    }
});

app.listen(3000); //связали с портом и запустили сервер