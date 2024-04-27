// Import required modules
import express from "express";
import bodyParser from "body-parser";
import pg from "pg";

// Initialize express app
const app = express();
const port = 3000;

// Setup database connection using pg client
const db = new pg.Client({
  user: "postgres",
  host: "localhost",
  database: "world",
  password: "123456",
  port: 5432,
});

// Establish the database connection
db.connect();

// Middlewares to parse URL-encoded data and serve static files
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

// Current user ID to keep track of the selected user
let currentUserId = 1;

// Sample users data
let users = [
  { id: 1, name: "Angela", color: "teal" },
  { id: 2, name: "Jack", color: "powderblue" },
];

// Function to retrieve countries visited by the current user
async function checkVisited() {
  const result = await db.query(
    "SELECT country_code FROM visited_countries JOIN users ON users.id = user_id WHERE user_id = $1; ",
    [currentUserId]
  );
  let countries = [];
  result.rows.forEach((country) => {
    countries.push(country.country_code);
  });
  return countries;
}

// Function to fetch the current user's information from the database
async function getCurrentUser() {
  const result = await db.query("SELECT * FROM users");
  users = result.rows;
  return users.find((user) => user.id == currentUserId);
}

// Main route to render the index page
app.get("/", async (req, res) => {
  const countries = await checkVisited();
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    // Handle the case where no users are left
    return res.render("index.ejs", {
      countries: [],
      total: 0,
      users: [],
      color: null,  // Default or placeholder color if needed
      currentUserId: null
    });
  }
  // Render the main page with user data and visited countries
  res.render("index.ejs", {
    countries: countries,
    total: countries.length,
    users: users,
    color: currentUser.color,
    currentUserId: currentUser.id
  });
});

// Handling GET requests to add a new user
app.get("/user", (req, res) => {
  if (req.query.add === "new") {
    res.render("new.ejs");
  } else {
    res.status(404).send("Page not found");
  }
});

// Route to modify the visited countries (add/delete)
app.post("/modify-country", async (req, res) => {
  const { country, action } = req.body;
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return res.status(404).send("User not found");
  }

  try {
    const result = await db.query(
      "SELECT country_code FROM countries WHERE LOWER(country_name) LIKE '%' || $1 || '%';",
      [country.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(404).send("Country not found");
    }
    const countryCode = result.rows[0].country_code;

    if (action === "add") {
      await db.query(
        "INSERT INTO visited_countries (country_code, user_id) VALUES ($1, $2)",
        [countryCode, currentUserId]
      );
    } else if (action === "delete") {
      await db.query(
        "DELETE FROM visited_countries WHERE country_code = $1 AND user_id = $2",
        [countryCode, currentUserId]
      );
    }

    res.redirect("/");
  } catch (err) {
    console.error("Error modifying visited countries: ", err);
    res.status(500).send("Failed to modify visited countries");
  }
});

// Route to handle user selection changes
app.post("/user", async (req, res) => {
  if (req.body.add === "new") {
    res.render("new.ejs");
  } else {
    currentUserId = req.body.user;
    res.redirect("/");
  }
});

// Route to add a new user
app.post("/new", async (req, res) => {
  const name = req.body.name;
  const color = req.body.color;

  const result = await db.query(
    "INSERT INTO users (name, color) VALUES($1, $2) RETURNING *;",
    [name, color]
  );

  const id = result.rows[0].id;
  currentUserId = id;

  res.redirect("/");
});

// Route to delete a user
app.post("/delete-user", async (req, res) => {
  const userId = req.body.userId;

  try {
    await db.query("BEGIN");
    await db.query("DELETE FROM visited_countries WHERE user_id = $1", [userId]);
    await db.query("DELETE FROM users WHERE id = $1", [userId]);
    await db.query("END");

    // Check if there are any users left after deletion
    const remainingUsers = await db.query("SELECT * FROM users");
    if (remainingUsers.rows.length > 0) {
      currentUserId = remainingUsers.rows[0].id;  // Reset to the first user in the list
    } else {
      currentUserId = null;  // No users left
    }

    res.redirect("/");
  } catch (err) {
    await db.query("ROLLBACK");
    console.error("Error deleting user: ", err);
    res.status(500).send("Failed to delete user");
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
