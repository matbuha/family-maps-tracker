import express from "express";
import bodyParser from "body-parser";
import pg from "pg";

const app = express();
const port = 3000;

const db = new pg.Client({
  user: "postgres",
  host: "localhost",
  database: "world",
  password: "Asaf240318",
  port: 5432,
});
db.connect();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

let currentUserId = 1;

let users = [
  { id: 1, name: "Angela", color: "teal" },
  { id: 2, name: "Jack", color: "powderblue" },
];

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

async function getCurrentUser() {
  const result = await db.query("SELECT * FROM users");
  users = result.rows;
  return users.find((user) => user.id == currentUserId);
}


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
    res.render("new.ejs");  // Make sure this template exists and is correctly set up to submit to "/new"
  } else {
    res.status(404).send("Page not found");
  }
});

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


app.post("/user", async (req, res) => {
  if (req.body.add === "new") {
    res.render("new.ejs");
  } else {
    currentUserId = req.body.user;
    res.redirect("/");
  }
});

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

app.post("/delete-user", async (req, res) => {
  const userId = req.body.userId;

  try {
    await db.query("BEGIN");
    await db.query("DELETE FROM visited_countries WHERE user_id = $1", [userId]);
    await db.query("DELETE FROM users WHERE id = $1", [userId]);
    await db.query("END");

    // Check if there are any users left
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



app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
