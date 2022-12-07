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
    var pageName = req.url;
    ws.cookie = req.headers.cookie;
    if (pageName in webSockets) {
        webSockets[pageName].push(ws)
    }
    else {
        webSockets[pageName] = [ws]
    }
    console.log('connected: ' + pageName + ' in ' + Object.getOwnPropertyNames(webSockets));

    const on_authorization = (message) => {
        client.query("SELECT * FROM public.user WHERE login LIKE $1 AND password LIKE $2;", [message.data.login, message.data.password],
            function(err, rows){ 
                if (err){ 
                    console.log(err);
                    return;
                }
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
        var user_id = null;
        if(req.cookies != undefined)
        {
            var cookie = req.cookies;
            if(cookie.login != undefined && cookie.password != undefined) 
            {            
                client.query("SELECT id, role FROM public.user WHERE login LIKE $1 AND password LIKE $2;", [cookie.login, cookie.password], function(err, rows){ 
                    if (err){
                        console.log(err); 
                        return;
                    }
                    user_id = rows.rows[0].id;
                });
            }
        }
        client.query("insert into list_of_problems values(default, $1, $2, $3, $4, default);", [message.data.fio, user_id, message.data.phone, message.data.problem_desc],
            function(err, rows){ 
                if (err){ 
                    console.log(err);
                    return;
                }
            });
        
        const key_to_send = "/list_of_problems.html";
        if(key_to_send in webSockets)
        {
            client.query("select * from list_of_problems", function(err, rows){ 
                if (err){
                    console.log(err); 
                    return;
                }
                for(var ws_to_send in webSockets[key_to_send]) {
                    webSockets[key_to_send][ws_to_send].send(JSON.stringify(rows));
                }
            });
        }
    }

    const task_distrib_update = (message) => {
        var message_data = JSON.parse(message.data.data);
        console.log(message_data);
        for(var i = 0; i < message_data.employee_id.length; ++i)
        {
            if(message_data.employee_id[i] != -1)
            {
                client.query("INSERT INTO task_distrib(employee_id, problem_id) VALUES($1, $2) " +
                             "ON CONFLICT (problem_id) DO UPDATE SET employee_id=$1;", [message_data.employee_id[i], message_data.problem_id[i]],
                    function(err, rows){
                    if (err){
                        console.log(err); 
                        return;
                    }
                });
            }
            else
            {
                client.query("DELETE FROM task_distrib WHERE problem_id=$1", [message_data.problem_id[i]],
                    function(err, rows){
                    if (err){
                        console.log(err); 
                        return;
                    }
                });
            }
        }

        const key_to_send = "/list_of_problems.html";
        if(key_to_send in webSockets)
        {
            var list_of_users = webSockets[key_to_send]
            for(var i = 0; i < list_of_users.length; ++i)
            {
                console.log(list_of_users[0].cookie);
                var optionList = list_of_users[0].cookie.split(';'); // ["login=admin", "password=qwertyu"]
                var loginOption = optionList[0].split('=');
                var login = loginOption[1];
                var passwordOption = optionList[1].split('=');
                var password = passwordOption[1];
                var data_to_send = {};
                data_to_send.to_employee = [];
                data_to_send.to_users = [];
                data_to_send.to_admins = [];
                data_to_send.to_others = [];
                var role = 'other';
                if(login != undefined && password != undefined) 
                {
                    client.query("SELECT id, role FROM public.user WHERE login LIKE $1 AND password LIKE $2;", [login, password], function(err, rows){ 
                        if (err){
                            console.log(err); 
                            return;
                        }
                        var data = {};
                        if(rows.rowCount != 0) {
                            role = rows.rows[0].role;
                            var id = rows.rows[0].id;
                            data.role = role;
                            if(role == "admin")
                            {
                                client.query("SELECT * FROM list_of_problems WHERE is_done = false;", function(err, rows){ 
                                    if (err){
                                        console.log(err); 
                                        return;
                                    }
                                    data.rows = rows;
                                    data_to_send.to_admins = JSON.stringify(data);
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
                                        data.rows = rows;
                                        data_to_send.to_employees = JSON.stringify(data);
                                    });
                            }
                            else if(role == 'user')
                            {
                                client.query("SELECT * FROM list_of_problems WHERE (user_id = $1);", [id], function(err, rows){ 
                                    if (err){
                                        console.log(err); 
                                        return;
                                    }
                                    data.rows = rows;
                                    data_to_send.to_users = JSON.stringify(data);
                                });
                            }
                            else
                            {
                                client.query("SELECT * FROM list_of_problems;", function(err, rows){ 
                                    if (err){
                                        console.log(err); 
                                        return;
                                    }
                                    data.role = undefined;
                                    data.rows = rows;
                                    data_to_send.to_others = JSON.stringify(data);
                                });
                            }
                        }
                        else {
                            client.query("SELECT * FROM list_of_problems;", function(err, rows){ 
                                if (err){
                                    console.log(err); 
                                    return;
                                }
                                data.role = undefined;
                                data.rows = rows;
                                data_to_send.to_others = JSON.stringify(data);
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
                        data_to_send.to_others = JSON.stringify(rows);
                    });
                }                
            }
            
            for(var ws_to_send in webSockets[key_to_send]) {
                switch (role)
                {
                    case 'admin' :
                    {
                        webSockets[key_to_send][ws_to_send].send(JSON.stringify(data_to_send.to_admins));
                        break;
                    }
                    case 'employee' :
                    {
                        webSockets[key_to_send][ws_to_send].send(JSON.stringify(data_to_send.to_employees));
                        break;
                    }
                    case 'user' :
                    {
                        webSockets[key_to_send][ws_to_send].send(JSON.stringify(data_to_send.to_users));
                        break;
                    }
                    case 'other' :
                    {
                        webSockets[key_to_send][ws_to_send].send(JSON.stringify(data_to_send.to_others));
                        break;
                    }
                }
                
            }
        }
    }

    const list_of_problems_update = (message) => {
        var message_data = JSON.parse(message.data.data);
        console.log(message_data);
        for(var i = 0; i < message_data.employee_id.length; ++i)
        {
            if(message_data.employee_id[i] != -1)
            {
                client.query("UPDATE list_of_problems SET is_done=$1, comment=$2) WHERE id=$3;", [message_data.is_done[i], message_data.comment[i], message_data.problem_id[i]],
                    function(err, rows){
                    if (err){
                        console.log(err); 
                        return;
                    }
                });
                client.query("DELETE FROM task_distrib WHERE problem_id=$1;", [message_data.problem_id[i]],
                    function(err, rows){
                    if (err){
                        console.log(err); 
                        return;
                    }
                });
            }
            else
            {
                client.query("DELETE FROM task_distrib WHERE problem_id=$1", [message_data.problem_id[i]],
                    function(err, rows){
                    if (err){
                        console.log(err); 
                        return;
                    }
                });
            }
        }
        const key_to_send = "/task_distrib.html";
        if(key_to_send in webSockets)
        {
            client.query("SELECT id, login FROM public.user WHERE role='employee';", function(err, rows){ 
                if (err){
                    console.log(err); 
                    return;
                }
                data.options_for_select = JSON.stringify(rows);

                client.query("SELECT list_of_problems.id, problem_desc, employee_id " +
                             "FROM list_of_problems LEFT JOIN task_distrib ON (problem_id = list_of_problems.id) " +
                             "WHERE is_done = false;", 
                    function(err, rows){ 
                        if (err){
                            console.log(err); 
                            return;
                        }
                        data.table_data = JSON.stringify(rows);

                        console.log(JSON.stringify(data));
                        for(var ws_to_send in webSockets[key_to_send]) {
                            webSockets[key_to_send][ws_to_send].send(JSON.stringify(data));
                        }
                });
            });  
        }
    }

    messageEmitter.on('authorization', on_authorization);
    messageEmitter.on('registration', on_registration);
    messageEmitter.on('new_problem', on_new_problem);
    messageEmitter.on('task_distrib_update', task_distrib_update);
    messageEmitter.on('list_of_problems_update', list_of_problems_update);

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
});
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
            var data = {};
            if(rows.rowCount != 0) {
                var role = rows.rows[0].role;
                var id = rows.rows[0].id;
                data.role = role;
                if(role == "admin")
                {
                    client.query("SELECT * FROM list_of_problems WHERE is_done = false;", function(err, rows){ 
                        if (err){
                            console.log(err); 
                            return;
                        }
                        data.rows = rows;
                        res.end(JSON.stringify(data));
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
                            data.rows = rows;
                            res.end(JSON.stringify(data));
                        });
                }
                else if(role == 'user')
                {
                    client.query("SELECT * FROM list_of_problems WHERE (user_id = $1);", [id], function(err, rows){ 
                        if (err){
                            console.log(err); 
                            return;
                        }
                        data.rows = rows;
                        res.end(JSON.stringify(data));
                    });
                }
                else
                {
                    client.query("SELECT * FROM list_of_problems;", function(err, rows){ 
                        if (err){
                            console.log(err); 
                            return;
                        }
                        data.role = undefined;
                        data.rows = rows;
                        res.end(JSON.stringify(data));
                    });
                }
            }
            else {
                client.query("SELECT * FROM list_of_problems;", function(err, rows){ 
                    if (err){
                        console.log(err); 
                        return;
                    }
                    data.role = undefined;
                    data.rows = rows;
                    res.end(JSON.stringify(data));
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
            res.end(JSON.stringify(rows));
        });
    }
});

app.get("/task_distribution.html", function(req,res){
    var cookie = req.cookies;
    if(cookie.login != undefined && cookie.password != undefined) 
    {
        client.query("SELECT role FROM public.user WHERE login LIKE $1 AND password LIKE $2;", [cookie.login, cookie.password], function(err, rows){ 
            if (err){
                console.log(err); 
                return;
            }
            if(rows.rowCount != 0) {
                var role = rows.rows[0].role;
                
                if(role == "admin")
                {
                    var data = {};
                    client.query("SELECT id, login FROM public.user WHERE role='employee';", function(err, rows){ 
                        if (err){
                            console.log(err); 
                            return;
                        }
                        data.options_for_select = JSON.stringify(rows);

                        client.query("SELECT list_of_problems.id, problem_desc, employee_id " +
                                     "FROM list_of_problems LEFT JOIN task_distrib ON (problem_id = list_of_problems.id) " +
                                     "WHERE is_done = false;", 
                            function(err, rows){ 
                                if (err){
                                    console.log(err); 
                                    return;
                                }
                                data.table_data = JSON.stringify(rows);

                                console.log(JSON.stringify(data));
                                res.end(JSON.stringify(data));
                        });
                    });                    
                }
                else
                {
                    res.end("Нет доступа!");
                }
            }
        });
    }
    else {
        res.end("Нет доступа!");
    }
});

app.listen(3000); //связали с портом и запустили сервер