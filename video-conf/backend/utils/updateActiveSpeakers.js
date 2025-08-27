const updateActiveSpeakers = (room, io) => {
  const activeSpeakers = room.activeSpeakerList.slice(0, 5);
  const mutedSpeakers = room.activeSpeakerList.slice(5);
  const newTransportsByPeer = {};

  room.clients.forEach((client) => {
    mutedSpeakers.forEach((audioPid) => {
      if (client?.producer?.audio?.id === audioPid) {
        client?.producer?.audio?.pause();
        client?.producer?.video?.pause();
        return;
      }
      const downstreamToStop = client.downstreamTransports.find(
        (t) => t.audio.producerId === audioPid
      );
      if (downstreamToStop) {
        downstreamToStop.audio.pause();
        downstreamToStop.video.pause();
      }
    });

    const newSpeakersToThisClient = [];
    activeSpeakers.forEach((audioPid) => {
      if (client?.producer?.audio?.id === audioPid) {
        client?.producer?.audio?.resume();
        client?.producer?.video?.resume();
        return;
      }
      const downstreamToStart = client.downstreamTransports.find(
        (t) => t?.associatedAudioPid === audioPid
      );
      if (downstreamToStart) {
        downstreamToStart.audio.resume();
        downstreamToStart.video.resume();
      } else {
        newSpeakersToThisClient.push(audioPid);
      }
    });
    if (newSpeakersToThisClient.length) {
      newTransportsByPeer[client.socket.id] = newSpeakersToThisClient;
    }
  });

  io.to(room.roomName).emit("updateActiveSpeakers", activeSpeakers);

  return newTransportsByPeer;
};

module.exports = updateActiveSpeakers;
