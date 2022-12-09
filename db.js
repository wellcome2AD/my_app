var pg = require('pg');
var conString = "postgres://postgres:1234@localhost:5432/my_app";

var client = new pg.Client(conString);
client.connect();

client.listOfProblemsQuery = function(req, res) {
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
                    client.query("SELECT list_of_problems.id, fio, login, phone, problem_desc, is_done, comment " +
                                 "FROM list_of_problems " +
                                 "LEFT JOIN public.user ON (user_id = public.user.id) " +
                                 "WHERE is_done = false " +
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
                else if(role == "employee")
                {
                    client.query("SELECT problem_id, problem_desc, is_done, comment " +
                                "FROM task_distrib " +
                                "RIGHT JOIN list_of_problems ON (problem_id = list_of_problems.id) " +
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
client.taskDistributionQuery = function(req, res){
    var cookie = req.cookies;
    var data = {};
    data.haveAccess = false;
    data.info = [];
    if(cookie.login != undefined && cookie.password != undefined) 
    {
        client.query("SELECT role FROM public.user WHERE login LIKE $1 AND password LIKE $2;", [cookie.login, cookie.password], function(err, rows){ 
            if (err){
                console.log(err); 
                return;
            }
            if(rows.rowCount == 0) {
                res.end();
            }
            var role = rows.rows[0].role;            
            if(role != "admin")
            {
                res.end("Нет доступа!");
                data.info = 'Нет доступа к этой странице';       
            }
            else
            {
                data.haveAccess = true;
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
            }
        });
    }
    else {
        res.end("Нет доступа!");
        data.info = 'Нет доступа к этой странице';
    }
}
client.addNewProblem = function(data){
    client.query("SELECT id, role FROM public.user WHERE login LIKE $1 AND password LIKE $2;", [data.login, data.password], function(err, rows){ 
        if (err){
            console.log(err); 
            return;
        }
        user_id = rows.rows[0].id;
        var message = data.message;
        client.query("INSERT INTO list_of_problems VALUES(default, $1, $2, $3, $4, default);", [message.data.fio, user_id, message.data.phone, message.data.problem_desc],
        function(err, rows){ 
            if (err){ 
                console.log(err);
                return;
            }
        });
    });
}
client.insertIntoTaskDistrib = function(employee_id, problem_id){
    client.query("INSERT INTO task_distrib(employee_id, problem_id) VALUES($1, $2) " +
                 "ON CONFLICT (problem_id) DO UPDATE SET employee_id=$1;", [employee_id, problem_id],
        function(err, rows){
        if (err){
            console.log(err); 
            return;
        }
    });
}
client.deleteFromTaskDistrib = function(problem_id){
    client.query("DELETE FROM task_distrib WHERE problem_id=$1", [problem_id],
    function(err, rows){
    if (err){
        console.log(err); 
        return;
    }
});
}
client.updateListOfProblems = function(message_data){
    client.query("UPDATE list_of_problems SET is_done=$1, comment=$2 WHERE id=$3;", [message_data.is_done, message_data.comment, message_data.problem_id],
        function(err, rows){
        if (err){
            console.log(err); 
            return;
        }
    });
}

module.exports = client;
