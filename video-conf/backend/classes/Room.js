const { mediaCodecs } = require("../config/config");
const updateActiveSpeakers = require("../utils/updateActiveSpeakers");

class Room {
  constructor(roomName, worker) {
    this.roomName = roomName;
    this.worker = worker;
    this.router = null;
    this.clients = [];
    this.activeSpeakerList = []; // an array of ids of with the most recent dominant speaker first
  }

  addClient(client) {
    this.clients.push(client);
  }
  async createRouter(io) {
    this.router = await this.worker.createRouter({
      mediaCodecs: mediaCodecs,
    });

    this.activeSpeakerObserver = await this.router.createActiveSpeakerObserver({
      interval: 300, // default
    });
    this.activeSpeakerObserver.on("dominantspeaker", (dominantSpeaker) => {
      console.log(dominantSpeaker.producer.id);

      const i = this.activeSpeakerList.findIndex(
        (pid) => pid === dominantSpeaker.producer.id
      );

      if (i > -1) {
        const [pid] = this.activeSpeakerList.splice(i, 1);
        this.activeSpeakerList.unshift(pid);
      } else {
        // this is a new producer, add it to the list
        this.activeSpeakerList.unshift(dominantSpeaker.producer.id);
      }

      console.log(this.activeSpeakerList);

      // update active user
      // ===needs refining 3 place===
      const newTransportsByPeer = updateActiveSpeakers(this, io);
      for (const [socketId, audioPidsToCreate] of Object.entries(
        newTransportsByPeer
      )) {
        const videoPidsToCreate = audioPidsToCreate.map((pid) => {
          const producingClient = this.clients.find(
            (c) => c?.producer?.audio?.id === pid
          );
          return producingClient?.producer?.video?.id;
        });
        const associatedUserNames = audioPidsToCreate.map((pid) => {
          const producingClient = this.clients.find(
            (c) => c?.producer?.audio?.id === pid
          );
          return producingClient.userName;
        });

        io.to(socketId).emit("newProducersToConsume", {
          routerRtpCapabilities: this.router.rtpCapabilities,
          audioPidsToCreate,
          videoPidsToCreate,
          associatedUserNames,
          activeSpeakerList: this.activeSpeakerList.slice(0, 5),
        });
      }
    });
  }
}

module.exports = Room;
