const express = require("express");
const url = require('url');

const http = require('http');
const cookieParser = require('cookie-parser');
const WebSocket = require('ws');
var bodyParser = require('body-parser');

var client = require("./db");
const router = require('./my_router');

const app = express();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(express.static('public', {extensions:['html']})); // статическое содержимое - в public, которая находится в корне проекта
app.use(cookieParser());

app.use('/', router);

const EE = require("events").EventEmitter;

var server = http.createServer(app);
var wss = new WebSocket.Server({ server }, webSockets = {});

server.listen(8181, function listening() {
    console.log('Listening on %d', server.address().port);
});

wss.on('connection', function connection(ws, req) {
    const messageEmitter = new EE();
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
                    ws.send(JSON.stringify({"info": "Такой пользователь уже есть", "redirect":"sign_up.html"}));
                }
                else {
                    client.query("INSERT INTO public.user VALUES(default, $1, $2);", [message.data.login, message.data.password],
                        function(err, rows){ 
                            if (err){ 
                                console.log(err);
                                return;
                            }                            
                        }
                    );
                    ws.send(JSON.stringify({"info": "Регистрация прошла успешно. Войдите в свой аккаунт", "redirect":"sign_in.html"}));
                }
            }
        );
    }

    const on_new_problem = (message) => {
        var user_id = null;
        if(message.data.cookie != undefined)
        {
            var cookie = message.data.cookie;
            var optionList = cookie.split(';'); // ["login=admin", "password=qwertyu"]
            var loginOption = optionList[0].split('=');
            var login = loginOption[1];
            var passwordOption = optionList[1].split('=');
            var password = passwordOption[1];
            if(login != undefined && password != undefined) 
            {
                var data = {};
                data.login = login;
                data.password = password;
                data.message = message;
                client.addNewProblem(data);
            }
        }        
        
        const key_to_send = "/list_of_problems.html";
        if(key_to_send in webSockets)
        {
            client.query("SELECT * FROM list_of_problems ORDER BY id;", function(err, rows){ 
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
        for(var i = 0; i < message_data.employee_id.length; ++i)
        {
            if(message_data.employee_id[i] != -1) // to do: перенести в db.js
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
            else // to do: перенести в db.js
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
                                webSockets[key_to_send][i].send(JSON.stringify(data_to_send.to_admins));
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
                                    }
                                );
                                webSockets[key_to_send][ws_to_send].send(JSON.stringify(data_to_send.to_employees));
                            }
                        }
                    });
                }             
            }
        }
    }

    const list_of_problems_update = (message) => {
        var message_data = JSON.parse(message.data.data);
        for(var i = 0; i < message_data.problem_id.length; ++i)
        {
            // to do: перенести в db.js
            client.query("UPDATE list_of_problems SET is_done=$1, comment=$2 WHERE id=$3;", [message_data.is_done[i], message_data.comment[i], message_data.problem_id[i]],
                function(err, rows){
                if (err){
                    console.log(err); 
                    return;
                }
            });
            if(message_data.is_done[i] == true) // to do: перенести в db.js 
            {
                client.query("DELETE FROM task_distrib WHERE problem_id=$1;", [message_data.problem_id[i]],
                    function(err, rows){
                    if (err){
                        console.log(err); 
                        return;
                    }
                });                
            }
        }

        const key_to_send = "/task_distribution.html";
        if(key_to_send in webSockets)
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
        messageEmitter.off('task_distrib_update', task_distrib_update);
        messageEmitter.off('list_of_problems_update', list_of_problems_update);
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

app.listen(3000); //связали с портом и запустили сервер
