const config = require("../config/config");

class Client {
  constructor(userName, socket) {
    this.userName = userName;
    this.socket = socket;

    this.upstreamTransport = null; // this client's transport for sending data
    this.producer = {}; // audio & video tracks

    // this client's transport for pulling data
    // listening to multiple producers
    this.downstreamTransports = [];
    // this.consumer = []; // an array of consumers, each with two parts (audio/video)

    this.room = null; // default could be [] if a user be in mutiple rooms simlult.
  }

  async addTransport(type, audioPid = null, videoPid = null) {
    const transport = await this.room.router.createWebRtcTransport({
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      listenInfos: [
        {
          protocol: "udp",
          ip: "127.0.0.1", // set to 0.0.0.0 when using announedIp
          announcedIp: null, // set to your public ip 192.168.0.102
        },
        {
          protocol: "tcp",
          ip: "127.0.0.1", // set to 0.0.0.0 when using announedIp
          announcedIp: null, // set to your public ip 192.168.0.102
        },
      ],
      initialAvailableOutgoingBitrate: config.initialAvailableOutgoingBitrate,
    });

    if (config.maxIncomingBitrate) {
      try {
        await transport.setMaxIncomingBitrate(config.maxIncomingBitrate);
      } catch (error) {
        console.log("Error while setting MaxIncomingBitrat", error);
      }
    }

    if (type === "producer") {
      this.upstreamTransport = transport;
    } else if (type === "consumer") {
      this.downstreamTransports.push({
        transport,
        associatedAudioPid: audioPid,
        associatedVideoPid: videoPid,
      });
    }

    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    };
  }

  async addProducer(kind, newProducer) {
    this.producer[kind] = newProducer;
    if (kind === "audio") {
      await this.room.activeSpeakerObserver.addProducer({
        producerId: newProducer.id,
      });
    }
  }

  async addConsumer(kind, newConsumer, downstreamTransport) {
    downstreamTransport[kind] = newConsumer;
  }
}

module.exports = Client;
