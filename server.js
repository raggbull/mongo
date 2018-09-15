
var express = require("express");
var bodyParser = require("body-parser");
var logger = require("morgan");
var mongoose = require("mongoose");
var path = require("path");
var Note = require("./models/Note.js");
var Article = require("./models/Article.js");
var request = require("request");
var cheerio = require("cheerio");

// If deployed, use the deployed database. Otherwise use the local mongoHeadlines database
var MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost/mongoHeadlines";

// Set mongoose to leverage built in JavaScript ES6 Promises
// Connect to the Mongo DB hope this works
mongoose.Promise = Promise;
mongoose.connect(MONGODB_URI);



var port = process.env.PORT || 3000;


var app = express();

// Use morgan and body parser with our app
app.use(logger("dev"));
app.use(bodyParser.urlencoded({
  extended: false
}));


app.use(express.static("public"));

var exphbs = require("express-handlebars");

app.engine("handlebars", exphbs({
  defaultLayout: "main",
  partialsDir: path.join(__dirname, "/views/layouts/partials")
}));
app.set("view engine", "handlebars");




var db = mongoose.connection;

// Show any mongoose errors
db.on("error", function (error) {
  console.log("Mongoose Error: ", error);
});

// Once logged in to the db through mongoose, log a success message
db.once("open", function () {
  console.log("You have made a connection.");
});



app.get("/", function (req, res) {
  Article.find({}, function (error, data) {
    var hbsObject = {
      article: data
    };
    console.log(hbsObject);
    res.render("home", hbsObject);
  });
});

app.get("/saved", function (req, res) {
  Article.find({
    "saved": true
  }).populate("notes").exec(function (error, articles) {
    var hbsObject = {
      article: articles
    };
    res.render("saved", hbsObject);
  });
});


app.get("/scrape", function (req, res) {
  request("https://www.nytimes.com/section/movies?module=SectionsNav&action=click&version=BrowseTree&region=TopBar&contentCollection=Arts%2FMovies&contentPlacement=2&pgtype=sectionfront", function (error, response, html) {
    // load that into cheerio 
    var $ = cheerio.load(html);
    var count = 0;
    // Now, we grab every h2 
    $(".template-3 .story").each(function (i, element) {
      if (count === 20) {
        return;
      }
     
      var result = {};

      // Add the title and summary 
      result.title = $(this).find('h2 > a').text();
      result.summary = $(this).find('p').text();
      result.link = $(this).find('h2 > a').attr("href");
   

      count++;


      var entry = new Article(result);

      // save that entry to the db
      entry.save(function (err, doc) {
        // Log any errors
        if (err) {
          console.log(err);
        }
        // Or log the doc
        else {
          console.log("SAVED", doc);
        }
      });

    });
    console.log("Are you counting", count);
    res.send("Scrape Complete");

  });

});

// Info scraped from the mongoDB
app.get("/articles", function (req, res) {
  // Grab every doc 
  Article.find({}, function (error, doc) {
    if (error) {
      console.log(error);
    }

    else {
      res.json(doc);
    }
  });
});

// Grab an article 
app.get("/articles/:id", function (req, res) {
  Article.findOne({
      "_id": req.params.id
    })
    .populate("note")

    .exec(function (error, doc) {
      // Log any errors
      if (error) {
        console.log(error);
      }
   
      else {
        res.json(doc);
      }
    });
});


// Save an article
app.post("/articles/save/:id", function (req, res) {

  Article.findOneAndUpdate({
      "_id": req.params.id
    }, {
      "saved": true
    })

    .exec(function (err, doc) {

      if (err) {
        console.log(err);
      } else {
       
        res.send(doc);
      }
    });
});

// Delete an article
app.post("/articles/delete/:id", function (req, res) {
  Article.findOneAndUpdate({
      "_id": req.params.id
    }, {
      "saved": false,
      "notes": []
    })

    .exec(function (err, doc) {

      if (err) {
        console.log(err);
      } else {
        res.send(doc);
      }
    });
});


// Create a new note
app.post("/notes/save/:id", function (req, res) {
  var newNote = new Note({
    body: req.body.text,
    article: req.params.id
  });
  console.log(req.body);
  newNote.save(function (error, note) {
    if (error) {
      console.log(error);
    }
    // Otherwise
    else {
      // Use the article id to find and update it's notes
      Article.findOneAndUpdate({
          "_id": req.params.id
        }, {
          $push: {
            "notes": note
          }
        })
 
        .exec(function (err) {
   
          if (err) {
            console.log(err);
            res.send(err);
          } else {
            res.send(note);
          }
        });
    }
  });
});

// Delete a note
app.delete("/notes/delete/:note_id/:article_id", function (req, res) {
  Note.findOneAndRemove({
    "_id": req.params.note_id
  }, function (err) {
    if (err) {
      console.log(err);
      res.send(err);
    } else {
      Article.findOneAndUpdate({
          "_id": req.params.article_id
        }, {
          $pull: {
            "notes": req.params.note_id
          }
        })
  
        .exec(function (err) {
          if (err) {
            console.log(err);
            res.send(err);
          } else {
         
            res.send("Note Deleted");
          }
        });
    }
  });
});

// Listen on port
app.listen(port, function () {
  console.log("App running on port " + port);
});