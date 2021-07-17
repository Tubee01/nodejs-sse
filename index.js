const app = require("express")();
const cors = require("cors");
const amqp = require("amqplib");
app.use(cors());


// start rabbitmq listener
rabbitmq_connect();

// response header for sever-sent events
const SSE_RESPONSE_HEADER = {
  Connection: "keep-alive",
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  "X-Accel-Buffering": "no",
};

// Connected users (request object of each user) :
var users = {};
// Connected messages of users:
var messages = {};
// SSE starting endpoint
// You can access url `http://localhost:8081/stream/<userId>`
//
app.get("/stream/:userId", function (req, res) {
  let userId = getUserId(req);

  // Stores this connection
  users[userId] = req;

  // Writes response header.
  res.writeHead(200, SSE_RESPONSE_HEADER);

  // Interval loop
  let intervalId = setInterval(function () {
    console.log(`*** Interval loop. userId: "${userId}"`);
    // Note:
    // For avoidance of client's request timeout,
    // you should send a heartbeat data like ':\n\n' (means "comment") at least every 55 sec (30 sec for first time request)
    // even if you have no sending data:
    res.write(
      messages[userId]?.data
        ? `data: ${JSON.stringify(messages[userId].data)} \n\n`
        : `:\n\n`
    );

    // Remove user messages
    delete messages[userId]?.data;
  }, 5000);

  // Note: Heatbeat for avoidance of client's request timeout of first time (30 sec)
  res.write(`:\n\n`);

  req.on("close", function () {
    let userId = getUserId(req);
    console.log(`*** Close. userId: "${userId}"`);
    // Breaks the interval loop on client disconnected
    clearInterval(intervalId);
    // Remove from connections
    delete users[userId];
  });

  req.on("end", function () {
    let userId = getUserId(req);
    console.log(`*** End. userId: "${userId}"`);
  });
});

async function rabbitmq_connect() {
  try {
    // connect to rabbitmq
    const connection = await amqp.connect("amqp://localhost:5672");
    const channel = await connection.createChannel();
    const result = await channel.assertQueue("messagesForClientUser");
    channel.consume("messagesForClientUser", (message) => {
      console.log("*** Received message.");
      let input = JSON.parse(message.content.toString());

      if (typeof messages[input.userId]?.data === "undefined")
        messages[input.userId] = { data: [] };

      messages[input.userId].data.push(input.text);

      channel.ack(message);
    });

    console.log(`*** Waiting for messages...`);
  } catch (ex) {
    console.error(ex);
  }
}

function getUserId(req) {
  return req.params.userId;
}

app.listen(8081, function () {
  console.log("Example app listening on port 8081!");
});
