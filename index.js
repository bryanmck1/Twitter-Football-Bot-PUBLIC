import fetch from "node-fetch";
import Twit from "twit";
import nodeCron from "node-cron";
import express from "express";
import moment from "moment";
import "dotenv/config";

const app = express();
const port = process.env.PORT || 3000;
//Your Sportmonks API Key
const sportmonksAPI = process.env.sportmonksAPI;
//The ID of the specified league you want to use, from sportmonks.com;
const leagueID = 8;
const liveScoresEndpoint = `https://soccer.sportmonks.com/api/v2.0/livescores/now?api_token=${sportmonksAPI}&include=events,localTeam,visitorTeam&leagues=${leagueID}`;

// //Used to store data so we can keep track of events that have already happened
let liveGamesArray = [];
let eventArray = [];
let finishedGames = [];
let eventLogger = [];

//Your keys for Twitter's API
const T = new Twit({
  consumer_key: process.env.consumer_key,
  consumer_secret: process.env.consumer_secret,
  access_token: process.env.access_token,
  access_token_secret: process.env.access_token_secret,
});

//Post a tweet
// T.post(
//   "statuses/update",
//   { status: "testing123" },
//   function (err, data, response) {
//     console.log(data);
//   }
// );

//Fetches the match ID's of the live games being played in the specified league;
async function getData() {
  const response = await fetch(liveScoresEndpoint);
  const results = await response.json();

  //Only runs if games are currently being played;
  if (results.data.length > 0) {
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
      } else if (liveGamesArray.indexOf(id) === -1 && status === "LIVE") {
        liveGamesArray.push(id);
      }
    }
  } else {
    console.log("No games currently being played.");
  }
  return liveGamesArray;
}

//Runs once a day to see whether there are games on the schedule;
nodeCron.schedule("30 11 * * *", async function () {
  const areThereGamesToday = await fetch(
    `https://soccer.sportmonks.com/api/v2.0/fixtures/date/${todaysDate}?api_token=${sportmonksAPI}&leagues=${leagueID}`
  );
  const response = await areThereGamesToday.json();

  //If there are games on the schedule, the function runs all day, every other minute;
  if (response.data.length > 0) {
    nodeCron.schedule("* 12-23 * * *", function () {
      getData().then((resArr) => {
        console.log(resArr);
        //Only runs if there are games currently being played;
        if (resArr.length > 0) {
          //Iterates through each game in the liveGamesArray;
          for (let i = 0; i < resArr.length; i++) {
            console.log("Iterating.");
            async function goalChecker() {
              const eventFetch = await fetch(
                `https://soccer.sportmonks.com/api/v2.0/fixtures/${resArr[i]}?api_token=${sportmonksAPI}&include=localTeam,visitorTeam,events.player`
              );
              const sportsData = await eventFetch.json();

              //Iterates through each event of the currently iterated match ID;
              for (let i = 0; i < sportsData.data.events.data.length; i++) {
                const {
                  type: eventType,
                  id: eventID,
                  minute: time,
                  var_result,
                  extra_minute,
                  result,
                } = sportsData.data.events.data[i];
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

                //If an event type is a goal, and the event isn't in the eventArray already, we tweet it out;
                if (
                  (eventArray.indexOf(eventID) === -1 &&
                    eventType === "goal") ||
                  eventType === "penalty"
                ) {
                  T.post(
                    "statuses/update",
                    {
                      status: `GOAL! ⚽ 
    
${player} | ${newTime}
      
${home_name} | ${homeScore}
${away_name} | ${awayScore}`,
                    },
                    function (err, data, response) {
                      //console.log(data);
                    }
                  );
                  eventArray.push(eventID);
                  eventLogger.push(sportsData.data.events.data);
                  break;
                } else if (
                  eventArray.indexOf(eventID) === -1 &&
                  eventType === "own-goal"
                ) {
                  T.post(
                    "statuses/update",
                    {
                      status: `OWN GOAL! ⚽ 
    
${player} | ${newTime}
      
${home_name} | ${homeScore}
${away_name} | ${awayScore}`,
                    },
                    function (err, data, response) {
                      //console.log(data);
                    }
                  );
                  eventArray.push(eventID);
                  eventLogger.push(sportsData.data.events.data);
                  break;
                } else if (
                  eventArray.indexOf(eventID) === -1 &&
                  eventType === "var" &&
                  var_result === "Goal Disallowed"
                ) {
                  T.post(
                    "statuses/update",
                    {
                      status: `GOAL DISALLOWED | ${newTime}' 
    
      
${home_name} | ${homeScore}
${away_name} | ${awayScore}`,
                    },
                    function (err, data, response) {
                      //console.log(data);
                    }
                  );
                  eventArray.push(eventID);
                  eventLogger.push(sportsData.data.events.data);
                }
              }
            }
            goalChecker();
          }
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
nodeCron.schedule("0 23 * * *", function () {
  liveGamesArray = [];
  eventArray = [];
  finishedGames = [];
  eventLogger = [];
  console.log("Arrays emptied.");
});

//Console.logs all of the goal events; used for debugging.
nodeCron.schedule("50 22 * * *", function () {
  console.log(eventLogger);
});

app.listen(port, () => {
  console.log(`listening on port ${port}`);
});
