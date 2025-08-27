import createConsumer from "./createConsumer";

function requestTransportToConsume(
  joinRoomResponse,
  device,
  socket,
  consumers
) {
  joinRoomResponse.audioPidsToCreate.forEach(async (audioPid, i) => {
    const videoPid = joinRoomResponse.videoPidsToCreate[i];
    const consumerTransportParams = await socket.emitWithAck(
      "requestTransport",
      {
        type: "consumer",
        audioPid,
      }
    ); // ask the server to make a transport and send

    console.log(consumerTransportParams);

    // create the transport once per peer/client/user...
    const consumerTransport = device.createRecvTransport(
      consumerTransportParams
    );
    consumerTransport.on("connectionstatechange", (state) => {
      console.log("==connectionstatechange== state: ", state);
    });
    consumerTransport.on("icegatheringstatechange", (state) => {
      console.log("==icegatheringstatechange== state: ", state);
    });
    consumerTransport.on(
      "connect",
      async ({ dtlsParameters }, callback, errback) => {
        console.log("Transport connect event has fired!");
        const connectRes = await socket.emitWithAck("connectTransport", {
          dtlsParameters,
          type: "consumer",
          audioPid,
        });

        console.log("connectRes", connectRes);

        if (connectRes === "success") {
          callback();
        } else if (connectRes === "error") {
          errback();
        }
      }
    );

    // then use the same transport for both producer (audio/video)
    const [audioConsumer, videoConsumer] = await Promise.all([
      createConsumer(
        consumerTransport,
        device.rtpCapabilities,
        audioPid,
        "audio",
        socket
      ),
      createConsumer(
        consumerTransport,
        device.rtpCapabilities,
        videoPid,
        "video",
        socket
      ),
    ]);

    const combinedStream = new MediaStream([
      audioConsumer?.track,
      videoConsumer?.track,
    ]);

    const remoteVideo = document.getElementById(`remote-video-${i}`);
    remoteVideo.srcObject = combinedStream;

    consumers[audioPid] = {
      combinedStream,
      userName: joinRoomResponse.associatedUserNames[i],
      consumerTransport,
      audioConsumer,
      videoConsumer,
    };
  });
}

export default requestTransportToConsume;
