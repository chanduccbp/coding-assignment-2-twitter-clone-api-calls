const express = require("express");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
  }
};

initializeDBAndServer();

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.payload = payload;
        next();
      }
    });
  }
};

app.post("/register", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  if (password.length < 6) {
    response.status(400);
    response.send("Password is too short");
  } else {
    const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
    const dbUser = await db.get(selectUserQuery);
    if (dbUser === undefined) {
      const createUserQuery = `
      INSERT INTO 
        user (name, username, password, gender) 
      VALUES 
        (
          '${name}', 
          '${username}',
          '${hashedPassword}', 
          '${gender}'
        );`;
      const dbResponse = await db.run(createUserQuery);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("User already exists");
    }
  }
});

app.post("/login", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
        userId: dbUser.user_id,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username, userId } = request.payload;
  const tweetsDetailsQuery = `SELECT username,tweet,date_time AS dateTime FROM (follower INNER JOIN tweet ON follower.following_user_id=tweet.user_id) INNER JOIN user ON tweet.user_id=user.user_id WHERE follower.follower_user_id=${userId} ORDER BY date_time DESC LIMIT 4;`;
  const tweetsDetails = await db.all(tweetsDetailsQuery);
  response.send(tweetsDetails);
});

app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username, userId } = request.payload;
  const followingDetailsQuery = `SELECT name FROM follower INNER JOIN user ON follower.following_user_id=user.user_id WHERE follower.follower_user_id=${userId};`;
  const followingDetails = await db.all(followingDetailsQuery);
  response.send(followingDetails);
});

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username, userId } = request.payload;
  const followersDetailsQuery = `SELECT name FROM follower INNER JOIN user ON follower.follower_user_id=user.user_id WHERE follower.following_user_id=${userId};`;
  const followersDetails = await db.all(followersDetailsQuery);
  response.send(followersDetails);
});

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const { username, userId } = request.payload;
  const tweetIdsQuery = `SELECT tweet_id FROM follower INNER JOIN tweet ON follower.following_user_id=tweet.user_id WHERE follower.follower_user_id=${userId};`;
  const tweetIds = await db.all(tweetIdsQuery);
  if (tweetIds.includes(tweetId)) {
    const getTweetDetailsQuery = `SELECT tweet,COUNT(like.like_id) AS likes,COUNT(reply.reply_id) AS replies,tweet.date_time AS dateTime FROM (tweet INNER JOIN like ON tweet.tweet_id=like.tweet_id) INNER JOIN reply ON like.tweet_id=reply.tweet_id WHERE tweet.tweet_id=${tweetId};`;
    const getTweetDetails = await db.get(getTweetDetailsQuery);
    response.send(getTweetDetails);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username, userId } = request.payload;
    const tweetIdsQuery = `SELECT tweet_id FROM follower INNER JOIN tweet ON follower.following_user_id=tweet.user_id WHERE follower.follower_user_id=${userId};`;
    const tweetIds = await db.all(tweetIdsQuery);
    if (tweetIds.includes(tweetId)) {
      const getUsernamesQuery = `SELECT username FROM like INNER JOIN user ON like.user_id=user.user_id WHERE like.tweet_id=${tweetId};`;
      const getUsernames = await db.all(getUsernamesQuery);
      response.send({ likes: getUsernames });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username, userId } = request.payload;
    const tweetIdsQuery = `SELECT tweet_id FROM follower INNER JOIN tweet ON follower.following_user_id=tweet.user_id WHERE follower.follower_user_id=${userId};`;
    const tweetIds = await db.all(tweetIdsQuery);
    if (tweetIds.includes(tweetId)) {
      const getReplyDetailsQuery = `SELECT username AS name,reply FROM reply INNER JOIN user ON reply.user_id=user.user_id WHERE reply.tweet_id=${tweetId};`;
      const getReplyDetails = await db.all(getReplyDetailsQuery);
      response.send({ replies: getReplyDetails });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { username, userId } = request.payload;
  const getTweetsDetailsQuery = `SELECT tweet,COUNT(like.like_id) AS likes,COUNT(reply.reply_id) AS replies,tweet.date_time AS dateTime FROM (tweet INNER JOIN like ON tweet.tweet_id=like.tweet_id) INNER JOIN reply ON like.tweet_id=reply.tweet_id WHERE tweet.user_id=${userId} GROUP BY tweet.tweet_id ;`;
  const getTweetsDetails = await db.all(getTweetsDetailsQuery);
  response.send(getTweetsDetails);
});

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const tweetDetails = request.body;
  const { tweet } = tweetDetails;
  const { username, userId } = request.payload;
  const addTweetQuery = `
    INSERT INTO
      tweet (tweet,user_id)
    VALUES
      (
        '${tweet}',
        ${userId}
      );`;

  await db.run(addTweetQuery);
  response.send("Created a Tweet");
});

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username, userId } = request.payload;
    const tweetUserIdQuery = `SELECT user_id FROM tweet WHERE tweet_id=${tweetId};`;
    const tweetUserId = await db.get(tweetUserIdQuery);
    if (tweetUserId.user_id === userId) {
      const deleteTweetQuery = `
        DELETE FROM
        tweet
        WHERE
        tweet_id = ${tweetId};`;
      await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
