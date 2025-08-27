const http = require("http");
const express = require("express");
const app = express();
const httpServer = http.createServer(app);

const socketio = require("socket.io");
const io = socketio(httpServer, {
  cors: ["http://localhost:5173"],
});

const createWorkers = require("./utils/createWorkers");
const Client = require("./classes/Client");
const getWorker = require("./utils/getWorker");
const Room = require("./classes/Room");
const updateActiveSpeakers = require("./utils/updateActiveSpeakers");

// mediasoup
let workers = null;
const rooms = [];

const initMediaSoup = async () => {
  workers = await createWorkers();
};
initMediaSoup();

io.on("connect", (socket) => {
  const handshake = socket.handshake;

  let client;

  socket.on("joinRoom", async ({ userName, roomName }, ackCb) => {
    let newRoom = false;
    client = new Client(userName, socket);

    let requestedRoom = rooms.find((r) => r.roomName === roomName);
    if (!requestedRoom) {
      newRoom = true;
      const workerToUse = await getWorker(workers);
      requestedRoom = new Room(roomName, workerToUse);
      await requestedRoom.createRouter(io);
      rooms.push(requestedRoom);
    }
    client.room = requestedRoom; // add the room to the client ( unnecessary)
    // the reason doing client.room cz above requestedRoom already has initalized inside client.room
    client.room.addClient(client); // add the client to the room

    socket.join(client.room.roomName);

    const audioPidsToCreate = client.room.activeSpeakerList.slice(0, 5);
    const videoPidsToCreate = audioPidsToCreate.map((pid) => {
      const producingClient = client.room.clients.find(
        (c) => c?.producer?.audio?.id === pid
      );
      return producingClient?.producer?.video?.id;
    });
    const associatedUserNames = audioPidsToCreate.map((pid) => {
      const producingClient = client.room.clients.find(
        (c) => c?.producer?.audio?.id === pid
      );
      return producingClient.userName;
    });

    ackCb({
      routerRtpCapabilities: client.room.router.rtpCapabilities,
      newRoom,
      audioPidsToCreate,
      videoPidsToCreate,
      associatedUserNames,
    });
  });

  socket.on("requestTransport", async ({ type, audioPid }, ackCb) => {
    let clientTransportParams;

    if (type === "producer") {
      clientTransportParams = await client.addTransport(type);
    } else if (type === "consumer") {
      // we have 1 transport per client we are streaming from
      // each trasport will have an audio and a video producer/consumer
      // let's get the videoPid
      const producingClient = client.room.clients.find(
        (c) => c?.producer?.audio?.id === audioPid
      );
      const videoPid = producingClient?.producer?.video?.id;
      clientTransportParams = await client.addTransport(
        type,
        audioPid,
        videoPid
      );
    }

    ackCb(clientTransportParams);
  });

  socket.on(
    "connectTransport",
    async ({ dtlsParameters, type, audioPid }, ackCb) => {
      if (type === "producer") {
        try {
          await client.upstreamTransport.connect({ dtlsParameters });
          ackCb("success");
        } catch (error) {
          console.log(error);
          ackCb("error");
        }
      } else if (type === "consumer") {
        try {
          const downstreamTransport = await client.downstreamTransports.find(
            (t) => t.associatedAudioPid === audioPid
          );

          downstreamTransport.transport.connect({ dtlsParameters });
          ackCb("success");
        } catch (error) {
          console.log(error);
          ackCb("error");
        }
      }
    }
  );

  socket.on("startProducing", async ({ kind, rtpParameters }, ackCb) => {
    try {
      const newProducer = await client.upstreamTransport.produce({
        kind,
        rtpParameters,
      });

      client.addProducer(kind, newProducer);

      if (kind === "audio") {
        client.room.activeSpeakerList.push(newProducer.id);
      }

      ackCb(newProducer.id);
    } catch (error) {
      console.log(error);
      ackCb("error");
    }

    // update active user
    const newTransportsByPeer = updateActiveSpeakers(client.room, io);
    for (const [socketId, audioPidsToCreate] of Object.entries(
      newTransportsByPeer
    )) {
      const videoPidsToCreate = audioPidsToCreate.map((pid) => {
        const producingClient = client.room.clients.find(
          (c) => c?.producer?.audio?.id === pid
        );
        return producingClient?.producer?.video?.id;
      });
      const associatedUserNames = audioPidsToCreate.map((pid) => {
        const producingClient = client.room.clients.find(
          (c) => c?.producer?.audio?.id === pid
        );
        return producingClient.userName;
      });

      io.to(socketId).emit("newProducersToConsume", {
        routerRtpCapabilities: client.room.router.rtpCapabilities,
        audioPidsToCreate,
        videoPidsToCreate,
        associatedUserNames,
        activeSpeakerList: client.room.activeSpeakerList.slice(0, 5),
      });
    }
  });

  socket.on("audioChange", (typeOfChange) => {
    if (typeOfChange === "mute") {
      client?.producer?.audio?.pause();
    } else {
      client?.producer?.audio?.resume();
    }
  });

  socket.on("consumeMedia", async ({ rtpCapabilities, pid, kind }, ackCb) => {
    try {
      if (
        !client.room.router.canConsume({
          producerId: pid,
          rtpCapabilities,
        })
      ) {
        ackCb("cannotConsume");
      } else {
        const downstreamTransport = client.downstreamTransports.find((t) => {
          if (kind === "audio") {
            return t.associatedAudioPid === pid;
          } else if (kind === "video") {
            return t.associatedVideoPid === pid;
          }
        });

        const newConsumer = await downstreamTransport.transport.consume({
          producerId: pid,
          rtpCapabilities,
          pause: true,
        });

        // the actual consumer with two tracks (audio/video) is being stored in order to have controls
        client.addConsumer(kind, newConsumer, downstreamTransport);

        ackCb({
          producerId: pid,
          id: newConsumer.id,
          kind: newConsumer.kind,
          rtpParameters: newConsumer.rtpParameters,
        });
      }
    } catch (error) {
      console.log(error);
      ackCb("consumeFailed");
    }
  });

  socket.on("unpauseConsumer", async ({ pid, kind }, ackCb) => {
    const consumerToResume = await client.downstreamTransports.find(
      (t) => t?.[kind]?.producerId === pid
    );

    consumerToResume[kind].resume();
    ackCb();
  });
});

httpServer.listen(5002);
