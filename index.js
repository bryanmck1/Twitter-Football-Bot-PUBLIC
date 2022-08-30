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
const myAPI = "SPORT MONKS API KEY";
//The ID of the specified league you want to use, from sportmonks.com;
const leagueID = 8;
const liveScoresEndpoint = `https://soccer.sportmonks.com/api/v2.0/livescores/now?api_token=${myAPI}&include=events,localTeam,visitorTeam&leagues=${leagueID}`;

//Used to store data so we can keep track of events that have already happened
let liveGamesArray = [];
let finishedGames = [];

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
  access_token: "xxxxxx-xxxxxx",
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
nodeCron.schedule("45 10 * * *", async function () {
  const areThereGamesToday = await fetch(
    `https://soccer.sportmonks.com/api/v2.0/fixtures/date/${todaysDate}?api_token=${myAPI}&leagues=${leagueID}`
  );
  const response = await areThereGamesToday.json();
  console.log(`There are ${response.data.length} games today`);

  //If there are games on the schedule, the function runs all day, every three minutes;
  if (response.data.length > 0) {
    nodeCron.schedule("*/3 11-23 * * *", function () {
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

          //Adds a match ID to the liveGamesArray if the game isn't finished AND if it isn't already in the array;
          if (status === "FT" && finishedGames.indexOf(id) === -1) {
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

            finishedGames.push(id);
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
            console.log(liveGamesArray);
            async function goalChecker() {
              const eventFetch = await fetch(
                `https://soccer.sportmonks.com/api/v2.0/fixtures/${liveGamesArray[i]}?api_token=${myAPI}&include=localTeam,visitorTeam,events.player`
              );
              const sportsData = await eventFetch.json();
              //Runs if there has been atleast one event in the match
              if (sportsData.data.events.data.length > 0) {
                const {
                  type: eventType,
                  minute: time,
                  fixture_id,
                  result,
                  extra_minute,
                } = sportsData.data.events.data[i];
                const { id: event_ID } = sportsData.data.events.data[i];
                const { display_name: player } =
                  sportsData.data.events.data[i].player.data;
                const { name: away_name } = sportsData.data.visitorTeam.data;
                const { name: home_name } = sportsData.data.localTeam.data;
                const {
                  localteam_score: homeScore,
                  visitorteam_score: awayScore,
                } = sportsData.data.scores;

                const newTime =
                  extra_minute == null
                    ? `${time}'`
                    : `${time}' + ${extra_minute}'`;
                const tweetEventStatus =
                  eventType == "goal" || eventType == "penalty"
                    ? "GOAL! ⚽"
                    : "OWN GOAL! ⚽";

                function postTweet() {
                  T.post(
                    "statuses/update",
                    {
                      status: `${tweetEventStatus} 

${player} | ${newTime}

${home_name} | ${homeScore}
${away_name} | ${awayScore}`,
                    },
                    function (err, data, response) {
                      //console.log(data);
                    }
                  );
                }

                if (
                  eventType === "goal" ||
                  eventType === "penalty" ||
                  eventType === "own-goal"
                ) {
                  //Queries into the DB to see if the current event has already been posted
                  const eventCheck = `SELECT * FROM events WHERE eventID = ${event_ID} OR matchID = ${fixture_id} AND playerName = '${player}' AND result = '${result}'`;
                  connection.query(eventCheck, function (err, res) {
                    if (err) throw err;
                    if (res.length == 0) {
                      console.log("No events exist, event was added");
                      const insertEvent = `INSERT INTO events (eventID, matchID, playerName, result) VALUES (${event_ID}, ${fixture_id}, '${player}', '${result}')`;

                      //Inserts currently iterated event into DB if it doesn't already exist
                      connection.query(insertEvent, function (err, res) {
                        if (err) throw err;
                        console.log(res);
                      });
                      postTweet();
                    } else if (res.length > 0) {
                      console.log("Event already exists");
                    }
                  });
                }
                //let eventArray = [];

                // function doesEventExist() {
                //   if (eventArray.length == 0) {
                //     return false;
                //   } else if (eventArray.length > 0) {
                //     for (let i = 0; i < eventArray.length; i++) {
                //       if (
                //         (eventArray[i].matchID == fixture_id &&
                //           eventArray[i].playerName == player &&
                //           eventArray[i].result == result) ||
                //         eventArray[i].eventID == event_ID
                //       ) {
                //         return true;
                //       }
                //     }
                //   }
                // }

                // if (
                //   eventArray.some(
                //     (x) =>
                //       x.eventID == event_ID ||
                //       (x.matchID == fixture_id &&
                //         x.playerName == player &&
                //         x.result == result)
                //   )
                // )

                // function pushToEventArr() {
                //   eventArray.push({
                //     matchID: fixture_id,
                //     eventID: event_ID,
                //     playerName: player,
                //     result: result,
                //   });
                // }
              }
            }
            goalChecker();
          }
          //console.log(eventArray);
        } else {
          console.log("No live games being played.");
        }
      });
    });
  } else {
    console.log("No games being played today");
  }
});

//Scheduled function that empties the arrays once a day;
nodeCron.schedule("0 9 * * *", function () {
  liveGamesArray = [];
  finishedGames = [];
  connection.query("DELETE FROM events", function (err, res) {
    if (err) throw err;
    console.log(res);
  });
  console.log("Data emptied.");
});

app.listen(port, () => {
  console.log(`listening on port ${port}`);
});
