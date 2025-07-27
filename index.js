const fs = require("fs");
const https = require("https");
const http = require("http");

const express = require("express");
const app = express();
app.use(express.static("public"));

const key = fs.readFileSync("./config/cert.key");
const cert = fs.readFileSync("./config/cert.crt");
const options = { key, cert };
// const httpServer = http.createServer(app);
// const httpsServer = https.createServer(options, app); // change 2 places

const socketio = require("socket.io");
const io = socketio(httpsServer);

const mediasoup = require("mediasoup");
const createWorkers = require("./createWorkers");
const { mediaCodecs } = require("./config/config");

// mediasoup
let workers = null;
let router = null;
let theProducer = null;

const initMediaSoup = async () => {
  workers = await createWorkers();
  router = await workers[0].createRouter({
    mediaCodecs: mediaCodecs,
  });
};
initMediaSoup();

io.on("connect", (socket) => {
  let thisClientProducerTransport = null;
  let thisClientProducer = null;
  let thisClientConsumerTransport = null;
  let thisClientConsumer = null;

  socket.on("getRtcCap", (callback) => {
    callback(router.rtpCapabilities); // callback will send the args back to the client
  });

  socket.on("create-transport", async ({ type }, callback) => {
    const transport = await router.createWebRtcTransport({
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      listenInfos: [
        {
          protocol: "udp",
          ip: "0.0.0.0",
          announcedIp: "34.126.127.101",
        },
        {
          protocol: "tcp",
          ip: "0.0.0.0",
          announcedIp: "34.126.127.101",
        },
      ],
    });

    if (type === "producer") {
      thisClientProducerTransport = transport;
    } else if (type === "consumer") {
      thisClientConsumerTransport = transport;
    }

    callback({
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    });
  });

  socket.on("connect-transport", async (dtlsParameters, callback) => {
    try {
      await thisClientProducerTransport.connect({ dtlsParameters });
      callback("success");
    } catch (error) {
      console.log(error);
      callback("error");
    }
  });

  socket.on("start-producing", async ({ kind, rtpParameters }, callback) => {
    try {
      thisClientProducer = await thisClientProducerTransport.produce({
        kind,
        rtpParameters,
      });
      theProducer = thisClientProducer;
      callback(thisClientProducer.id);
    } catch (error) {
      console.log(error);
      callback("error");
    }
  });

  socket.on("connect-consumer-transport", async (dtlsParameters, callback) => {
    try {
      await thisClientConsumerTransport.connect({ dtlsParameters });
      callback("success");
    } catch (error) {
      console.log(error);
      callback("error");
    }
  });

  socket.on("consume-media", async ({ rtpCapabilities }, callback) => {
    if (!theProducer) {
      callback("noProducer");
    } else if (
      !router.canConsume({ producerId: theProducer.id, rtpCapabilities })
    ) {
      callback("cannotConsume");
    } else {
      thisClientConsumer = await thisClientConsumerTransport.consume({
        producerId: theProducer.id,
        rtpCapabilities,
        paused: true,
      });

      callback({
        producerId: theProducer.id,
        id: thisClientConsumer.id,
        kind: thisClientConsumer.kind,
        rtpParameters: thisClientConsumer.rtpParameters,
      });
    }
  });

  socket.on("resumeConsumer", async (callback) => {
    await thisClientConsumer.resume();
  });
});

httpsServer.listen(5000);
