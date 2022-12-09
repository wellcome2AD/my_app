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

module.exports = client;
