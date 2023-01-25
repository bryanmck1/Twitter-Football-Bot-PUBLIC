import fetch from "node-fetch";
import Twit from "twit";
import nodeCron from "node-cron";
import express from "express";
import mysql from "mysql";
import moment from "moment";
import "dotenv/config";

const app = express();
const port = process.env.PORT || 3000;
const todaysDate = moment().format("YYYY-MM-DD");
const myAPI = "SPORTMONKS API KEY";
//The ID of the specified league you want to use, from sportmonks.com;
const leagueID = 8;
const liveScoresEndpoint = `https://soccer.sportmonks.com/api/v2.0/livescores/now?api_token=${myAPI}&include=events,localTeam,visitorTeam&leagues=${leagueID}`;

//Used to keep track of and iterate through live games
let liveGamesArray = [];

const connection = mysql.createPool({
  host: "xxxxxx",
  user: "xxxxxx",
  password: "xxxxxx",
  database: "xxxxxx",
});

//Keys for Twitter's API
const T = new Twit({
  consumer_key: "xxxxxx",
  consumer_secret: "xxxxxx",
  access_token: "xxxxxx",
  access_token_secret: "xxxxxx",
});

//Posts a tweet
// T.post(
//   "statuses/update",
//   { status: "testing123" },
//   function (err, data, response) {
//     console.log(data);
//   }
// );

//Runs once a day to see whether there are games on the schedule;
(async () => {
  const areThereGamesToday = await fetch(
    `https://soccer.sportmonks.com/api/v2.0/fixtures/date/${todaysDate}?api_token=${myAPI}&leagues=${leagueID}`
  );
  const response = await areThereGamesToday.json();
  console.log(`There are ${response.data.length} games today`);

  //If there are games on the schedule, the function runs all day, every three minutes;
  if (response.data.length > 0) {
    nodeCron.schedule("*/3 10-23 * * *", function () {
      async function getData() {
        const response = await fetch(liveScoresEndpoint);
        const results = await response.json();

        //Iterates through the games currently being played;
        for (let i = 0; i < results.data.length; i++) {
          const { id } = results.data[i];
          const { name: home_name } = results.data[i].localTeam.data;
          const { name: away_name } = results.data[i].visitorTeam.data;
          const { status } = results.data[i].time;
          const {
            localteam_score: homeTeamScore,
            visitorteam_score: awayTeamScore,
          } = results.data[i].scores;

          //Adds a match ID to the liveGamesArray if the game isn't finished AND if it isn't in the database;
          if (status === "FT") {
            const checkFinishedGames = `SELECT * FROM finished_games WHERE matchID = ${id}`;
            connection.query(checkFinishedGames, function (err, res) {
              if (err) throw err;
              if (res.length == 0) {
                console.log("Finished game ID is not in DB, inserting now");
                const insertFinishedGame = `INSERT INTO finished_games (matchID) VALUES (${id})`;
                connection.query(insertFinishedGame, function (err, res) {
                  if (err) throw err;
                  console.log("Finished game insert successful");
                });

                T.post(
                  "statuses/update",
                  {
                    status: `FINAL

            ${home_name} | ${homeTeamScore}
            ${away_name} | ${awayTeamScore}

            #PremierLeague`,
                  },
                  function (err, data, response) {
                    //console.log(data);
                  }
                );
              } else if (res.length > 0) {
                //console.log("Finished game is already in DB");
              }
            });

            const index = liveGamesArray.indexOf(id);
            if (index > -1) {
              liveGamesArray.splice(index, 1);
            }
          } else if (liveGamesArray.indexOf(id) === -1 && status === "LIVE") {
            liveGamesArray.push(id);
          }
        }
      }

      getData().then(() => {
        //Only runs if there are games currently being played;
        if (liveGamesArray.length > 0) {
          //Iterates through each game in the liveGamesArray;
          for (let i = 0; i < liveGamesArray.length; i++) {
            async function goalChecker() {
              const eventFetch = await fetch(
                `https://soccer.sportmonks.com/api/v2.0/fixtures/${liveGamesArray[i]}?api_token=${myAPI}&include=localTeam,visitorTeam,events.player`
              );
              const sportsData = await eventFetch.json();
              //Runs if there has been atleast one event in the match
              if (sportsData.data.events.data.length > 0) {
                for (let i = 0; i < sportsData.data.events.data.length; i++) {
                  const {
                    type,
                    var_result,
                    minute: time,
                    fixture_id,
                    result,
                    extra_minute,
                  } = Object(sportsData.data.events.data[i]);
                  const { id: event_ID } = Object(
                    sportsData.data.events.data[i]
                  );
                  const { display_name: player } = Object(
                    sportsData.data.events.data[i].player.data
                  );
                  const { name: away_name } = Object(
                    sportsData.data.visitorTeam.data
                  );
                  const { name: home_name } = Object(
                    sportsData.data.localTeam.data
                  );
                  const {
                    localteam_score: homeScore,
                    visitorteam_score: awayScore,
                  } = Object(sportsData.data.scores);
                  const newTime =
                    extra_minute == null
                      ? `${time}'`
                      : `${time}' + ${extra_minute}'`;
                  let tweetEventStatus = null;
                  function postTweet() {
                    T.post(
                      "statuses/update",
                      {
                        status: `
${tweetEventStatus} 
  
${player} | ${newTime}
  
${home_name} | ${homeScore}
${away_name} | ${awayScore}`,
                      },
                      function (err, data, response) {
                        //console.log(data);
                      }
                    );
                  }

                  if (type == "goal" || type == "penalty") {
                    //Queries into the DB to see if the currently iterated event has already been posted
                    const eventCheck = `SELECT * FROM events WHERE eventID = ${event_ID} OR matchID = ${fixture_id} AND playerName = '${player}' AND result = '${result}' AND eventType = 'Goal'`;
                    connection.query(eventCheck, function (err, res) {
                      if (err) throw err;
                      if (res.length == 0) {
                        console.log("No events exist, event was added");
                        const insertEvent = `INSERT INTO events (eventID, matchID, playerName, result, eventType) VALUES (${event_ID}, ${fixture_id}, '${player}', '${result}', 'Goal')`;

                        //Inserts currently iterated event into DB if it doesn't already exist
                        connection.query(insertEvent, function (err, res) {
                          if (err) throw err;
                        });
                        tweetEventStatus = "GOAL!";
                        postTweet();
                      } else if (res.length > 0) {
                        //console.log("Event already exists");
                      }
                    });
                  } else if (type == "own-goal") {
                    //Queries into the DB to see if the currently iterated event has already been posted
                    const eventCheck = `SELECT * FROM events WHERE eventID = ${event_ID} OR matchID = ${fixture_id} AND playerName = '${player}' AND result = '${result}' AND eventType = 'Goal'`;
                    connection.query(eventCheck, function (err, res) {
                      if (err) throw err;
                      if (res.length == 0) {
                        console.log("No events exist, event was added");
                        const insertEvent = `INSERT INTO events (eventID, matchID, playerName, result, eventType) VALUES (${event_ID}, ${fixture_id}, '${player}', '${result}', 'Goal')`;

                        //Inserts currently iterated event into DB if it doesn't already exist
                        connection.query(insertEvent, function (err, res) {
                          if (err) throw err;
                        });
                        tweetEventStatus = "OWN GOAL!";
                        postTweet();
                      } else if (res.length > 0) {
                        console.log("Event already exists");
                      }
                    });
                  } else if (type == "var" && var_result == "Goal Disallowed") {
                    const disallowedCheck = `SELECT * FROM events WHERE eventID = ${event_ID} OR matchID = ${fixture_id} AND playerName = '${player}' AND result = '${result}' AND eventType = 'Disallowed goal'`;
                    connection.query(disallowedCheck, function (err, res) {
                      if (err) throw err;
                      if (res.length == 0) {
                        console.log("No events exist, event was added");
                        const insertDisallowed = `INSERT INTO events (eventID, matchID, playerName, result, eventType) VALUES (${event_ID}, ${fixture_id}, '${player}', '${result}', 'Disallowed goal')`;

                        //Inserts currently iterated event into DB if it doesn't already exist
                        connection.query(insertDisallowed, function (err, res) {
                          if (err) throw err;
                        });
                        tweetEventStatus = "GOAL DISALLOWED ❌";
                        postTweet();
                      } else if (res.length > 0) {
                        //console.log("Event already exists");
                      }
                    });
                  }
                }
              }
            }
            goalChecker();
          }
        } else {
        }
      });
    });
  } else {
    console.log("No games being played today");
  }
})();

//Scheduled function that empties database once a day;
nodeCron.schedule("0 9 * * *", function () {
  liveGamesArray = [];
  //finishedGames = [];
  connection.query("DELETE FROM events", function (err, res) {
    if (err) throw err;
    console.log(res);
  });
  connection.query("DELETE FROM finished_games", function (err, res) {
    if (err) throw err;
    console.log(res);
  });

  console.log("Data emptied.");
});

app.listen(port, () => {
  console.log(`listening on port ${port}`);
});
