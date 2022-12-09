const express = require('express');
const path = require('path');

var client = require("./db");

const router = express.Router();

router.get("/", function(req, res){
    res.redirect("/form.html");
})
router.get("/list_of_problems.html", function(req,res){
    client.listOfProblemsQuery(req, res);    
});

router.get("/task_distribution.html", function(req,res){
    client.taskDistributionQuery(req, res);    
});

module.exports = router;
