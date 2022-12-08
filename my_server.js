const express = require("express");
const url = require('url');

const http = require('http');
const cookieParser = require('cookie-parser');
const WebSocket = require('ws');

var client = require("./db");

var bodyParser = require('body-parser');

const app = express();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(express.static('public', {extensions:['html']})); // статическое содержимое - в public, которая находится в корне проекта
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
        console.log(message);
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
                client.query("SELECT id, role FROM public.user WHERE login LIKE $1 AND password LIKE $2;", [login, password], function(err, rows){ 
                    if (err){
                        console.log(err); 
                        return;
                    }
                    user_id = rows.rows[0].id;
                    client.query("INSERT INTO list_of_problems VALUES(default, $1, $2, $3, $4, default);", [message.data.fio, user_id, message.data.phone, message.data.problem_desc],
                        function(err, rows){ 
                            if (err){ 
                                console.log(err);
                                return;
                            }
                    });
                });
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
        console.log(message_data);
        for(var i = 0; i < message_data.problem_id.length; ++i)
        {
            client.query("UPDATE list_of_problems SET is_done=$1, comment=$2 WHERE id=$3;", [message_data.is_done[i], message_data.comment[i], message_data.problem_id[i]],
                function(err, rows){
                if (err){
                    console.log(err); 
                    return;
                }
            });
            if(message_data.is_done[i] == true)            
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

app.get("/", function(req, res){
    res.redirect("/form.html");
})
app.get("/list_of_problems.html", function(req,res){
    var cookie = req.cookies;
    var data = {};
    data.role = undefined;
    if(cookie.login != undefined && cookie.password != undefined) 
    {
        client.query("SELECT id, role FROM public.user WHERE login LIKE $1 AND password LIKE $2;", [cookie.login, cookie.password], function(err, rows){ 
            if (err){
                console.log(err); 
                return;
            }
            if(rows.rowCount != 0) {
                var role = rows.rows[0].role;
                var id = rows.rows[0].id;
                data.role = role;
                if(role == "admin")
                {
                    client.query("SELECT * FROM list_of_problems WHERE is_done = false ORDER BY id;", function(err, rows){ 
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
                else
                {                    
                    client.query("SELECT list_of_problems.id, fio, login, phone, problem_desc, is_done, comment " + 
                             "FROM list_of_problems " +
                             "LEFT JOIN public.user ON (user_id = public.user.id) " +
                             "ORDER BY list_of_problems.id;", 
                        function(err, rows){
                            if (err){
                                console.log(err); 
                                return;
                            }
                            data.rows = rows;
                            res.end(JSON.stringify(data));
                    });
                }
            }
        });
    }    
    client.query("SELECT list_of_problems.id, fio, login, phone, problem_desc, is_done, comment " + 
                            "FROM list_of_problems " +
                            "LEFT JOIN public.user ON (user_id = public.user.id) " +
                            "ORDER BY list_of_problems.id;", 
        function(err, rows){
            if (err){
                console.log(err); 
                return;
            }
            data.rows = rows;
            res.end(JSON.stringify(data));
    });
});

app.get("/task_distribution.html", function(req,res){
    var cookie = req.cookies;
    var data = {};
    data.haveAccess = false;
    data.info = [];
    data.options_for_select = [];
    data.table_data = [];
    if(cookie.login != undefined && cookie.password != undefined) 
    {
        client.query("SELECT role FROM public.user WHERE login LIKE $1 AND password LIKE $2;", [cookie.login, cookie.password], function(err, rows){ 
            if (err){
                console.log(err); 
                return;
            }
            if(rows.rowCount == 0) {
                data.haveAccess = true;
                data.info = "Список проблем пуст. Можно отдохнуть"
                res.end(JSON.stringify(data));
            }
            var role = rows.rows[0].role;            
            if(role == "!admin")
            {
                data.haveAccess = true;                
                data.info = 'Нет доступа к странице';
                res.end(JSON.stringify(data));                  
            }
            data.haveAccess = 1;
            client.query("SELECT id, login FROM public.user WHERE role='employee';", function(err, rows){ 
                if (err){
                    console.log(err); 
                    return;
                }
                data.options_for_select = JSON.stringify(rows);

                client.query("SELECT list_of_problems.id, problem_desc, employee_id " +
                             "FROM list_of_problems LEFT JOIN task_distrib ON (problem_id = list_of_problems.id) " +
                             "WHERE is_done = false ORDER BY list_of_problems.id;", 
                    function(err, rows){ 
                        if (err){
                            console.log(err); 
                            return;
                        }
                        data.table_data = JSON.stringify(rows);
                        res.end(JSON.stringify(data));
                });
            });
        });
    }
    else {
        data.haveAccess = false;
        data.info = 'Нет доступа к странице';
        res.end(JSON.stringify(data));
    }
});

app.listen(3000); //связали с портом и запустили сервер
