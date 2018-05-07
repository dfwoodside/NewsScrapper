// DEPENDENCIES
var express = require("express");
var exphbs = require("express-handlebars");
var bodyParser = require("body-parser");
var logger = require("morgan");
var methodOverride = require("method-override");
var mongoose = require("mongoose");
// Models
var Note = require("./models/Note.js");
var Article = require("./models/Article.js");
// Scraping tools
var request = require("request");
var cheerio = require("cheerio");
// Setting mongoose to leverage built in JavaScript ES6 Promises
mongoose.Promise = Promise;


/*******************************************/
// SETTING UP THE EXPRESS APP
var app = express();
var PORT = process.env.PORT || 3000;

// Setting up the Express app with morgan
app.use(logger("dev"));

// Setting up the Express app to handle data parsing
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.text());
app.use(bodyParser.json({ type: "application/vnd.api+json" }));

// Serving static content for the app from the "public" directory in the app directory
app.use(express.static(process.cwd() + "/public"));

// Overriding with POST having ?_method=DELETE
app.use(methodOverride("_method"));


/*******************************************/
// SETTING UP HANDLEBARS
app.engine("handlebars", exphbs({
    defaultLayout: "main"
}));
app.set("view engine", "handlebars");


/*******************************************/
// CONFIGURING DB
// Database configuration with mongoose
mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost/articles_db");
var db = mongoose.connection;

// Show any mongoose errors
db.on("error", function(error) {
  console.log("Mongoose Error: ", error);
});

// Once logged in to the db through mongoose, logging a success message
db.once("open", function() {
  console.log("Mongoose connection successful.");
});


/*******************************************/
// ROUTES
// A GET request to scrape the NYT website
app.get("/scrape", function(req, res) {
  // Grabbing the body of the html with request
  request("https://www.nytimes.com/", function(error, response, html) {
    // Loading that into cheerio and saving it to $ for a shorthand selector
    var $ = cheerio.load(html);
    // Grabbing every h2 within an article tag
    $("article h2").each(function(i, element) {

      // Saving an empty result object
      var result = {};

      // Adding the text and href of every link, and saving them as properties of the result object
      result.title = $(this).children("a").text().trim();
      result.link = $(this).children("a").attr("href");

      // Using the Article model, creating a new entry
      var entry = new Article(result);

      // Saving the entry to the db
      entry.save(function(err, doc) {
        // Logging any errors
        if (err) {
          console.log(err);
        }
        // Logging the doc
        else {
          console.log(doc);
        }
      });

    });
  });
  // Telling the browser that we finished scraping the text
  res.redirect("/");
});

// Using a GET request to pull the articles we scraped from the mongoDB
app.get("/", function(req, res) {
  // Grabbing every doc in the Articles array
  Article.find({}, function(error, doc) {
    // Logging any errors
    if (error) {
      console.log(error);
    }
    // Sending the doc to the browser
    else {
      var articleObj = {
        article: doc
      };
      res.render("index", articleObj);
    }
  }).
  sort({ datePulled: -1, title: 1}).
  limit(30);
});

// Using a PUT request to save articles
app.put("/:id", function(req, res) {
  // Using the article id to find and update its status to "saved"
  Article.findOneAndUpdate({ "_id": req.params.id }, { "saved": req.body.saved })
  // Executing the above query
    .exec(function(err, doc) {
      // Logging any errors
      if (err) {
        console.log(err);
      }
      else {
        // Logging to confirm "saved" status was successfully changed
        console.log("Successfully saved: '%s'", doc.title);
      }
    });
    res.redirect("/");
});

// Using a GET request to pull the saved articles
app.get("/saved", function(req, res) {
  // Grabbing every doc in the Articles array that is saved
  Article.find({ saved: true }, function(error, doc) {
    // Logging any errors
    if (error) {
      console.log(error);
    }
    // Sending the doc to the browser
    else {
      var articleObj = {
        article: doc
      };
      res.render("saved", articleObj);
    }
  });
});

// Using a PUT request to "unsave" an article
app.put("/delete/:id", function(req, res) {
  // "Unsaving" an article based on its ObjectId
  Article.findOneAndUpdate({ "_id": req.params.id }, { "saved": req.body.saved })
  // Executing the above query
    .exec(function(err, doc) {
      // Logging any errors
      if (err) {
        console.log(err);
      }
      else {
        // Logging to confirm "saved" status was successfully changed
        console.log("Successfully removed: '%s'", doc.title);
      }
    });
  res.redirect("/saved");
});

// Using a GET request to pull all saved notes associated with an article 
app.get("/notes/:id", function(req, res) {
  // Using the id passed in the id parameter, prepare a query that finds the matching one in our db...
  console.log(req.params.id);
  Article.find({ "_id": req.params.id })
  // Populating all of the notes associated with it
  .populate("note")
  // Executing the query
  .exec(function(error, doc) {
    // Logging any errors
    if (error) {
      console.log(error);
    }
    // Sending the doc to the browser as a JSON object
    else {
      var articleObj = {
        article: doc
      };
      res.render("notes", articleObj);
    }
  });
});

// Using a POST request to create a new note
app.post("/notes/:id", function(req, res) {
  // Creating a new note and pass the req.body to the entry
  var newNote = new Note(req.body);
  // Saving the new note the db
  newNote.save(function(error, doc) {
    // Logging any errors
    if (error) {
      console.log(error);
    }
    else {
      // Using the article id to find and update its note
      Article.findOneAndUpdate({ "_id": req.params.id }, { $push: { "note": doc._id } }, { new: true }, function(err, doc) {
        // Logging any errors
        if (err) {
          console.log(err);
        }
        else {
          console.log("New note: " + doc);
          // Sending the doc to the browser
         res.redirect("/notes/" + req.params.id)
        }
      });
    }
  });
});

// Using a PUT request to delete saved notes associated with an article 
app.put("/note/:id", function(req, res) {
  // Deleting a note based on its ObjectId
  Note.remove({ "_id": req.params.id })
  // Executing the above query
    .exec(function(err, doc) {
      // Logging any errors
      if (err) {
        console.log(err);
      }
      else {
        // Sending the doc to the browser
        console.log(doc);
      }
    });
  res.redirect("/saved");
});

// Listening on port 3000
app.listen(PORT, function() {
  console.log("App running on port " + PORT);
});