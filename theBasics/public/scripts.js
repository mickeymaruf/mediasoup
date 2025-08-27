// Globas
let socket = null;
let device = null;
let localStream = null;
let producerTransport = null;
let producer = null;
let consumerTransport = null;
let consumer = null;

// Connect to server
const initConnect = () => {
  socket = io("https://192.168.0.102:5001");
  connectButton.innerHTML = "Connecting...";
  connectButton.disabled = true;
  addSocketListener();
};

const deviceSetup = async () => {
  device = new mediasoupClient.Device();
  const routerRtpCapabilities = await socket.emitWithAck("getRtcCap");
  await device.load({ routerRtpCapabilities });

  deviceButton.disabled = true;
  createProdButton.disabled = false;
  createConsButton.disabled = false;
};

const addSocketListener = () => {
  socket.on("connect", () => {
    connectButton.innerHTML = "Connected";
    deviceButton.disabled = false;
  });
};

const createProducer = async () => {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    localVideo.srcObject = localStream;
  } catch (error) {
    console.log(error);
  }

  const { id, iceParameters, iceCandidates, dtlsParameters } =
    await socket.emitWithAck("create-transport", { type: "producer" });

  producerTransport = device.createSendTransport({
    id,
    iceParameters,
    iceCandidates,
    dtlsParameters,
  });

  producerTransport.on(
    "connect",
    async ({ dtlsParameters }, callback, errback) => {
      const response = await socket.emitWithAck(
        "connect-transport",
        dtlsParameters
      );
      if (response === "success") {
        callback();
      } else if (response === "error") {
        errback();
      }
    }
  );

  producerTransport.on("produce", async (parameters, callback, errback) => {
    const { kind, rtpParameters } = parameters;
    const response = await socket.emitWithAck("start-producing", {
      kind,
      rtpParameters,
    });

    if (response === "error") {
      errback();
    } else {
      callback({ id: response.id });
    }

    publishButton.disabled = true;
    createConsButton.disabled = false;
  });

  createProdButton.disabled = true;
  publishButton.disabled = false;
};

const publish = async () => {
  const videoTrack = localStream.getVideoTracks()[0];
  const producer = await producerTransport.produce({
    track: videoTrack,
  });
};

const createConsumer = async () => {
  const { id, iceParameters, iceCandidates, dtlsParameters } =
    await socket.emitWithAck("create-transport", { type: "consumer" });

  consumerTransport = device.createRecvTransport({
    id,
    iceParameters,
    iceCandidates,
    dtlsParameters,
  });

  consumerTransport.on(
    "connect",
    async ({ dtlsParameters }, callback, errback) => {
      const response = await socket.emitWithAck(
        "connect-consumer-transport",
        dtlsParameters
      );

      if (response === "success") {
        callback();
      } else if (response === "error") {
        errback();
      }
    }
  );

  createConsButton.disabled = true;
  consumeButton.disabled = false;
};

const consume = async () => {
  const data = await socket.emitWithAck("consume-media", {
    rtpCapabilities: device.rtpCapabilities,
  });

  if (data === "noProducer") {
    console.log("There is no producer setup to consume.");
  } else if (data === "cannotConsume") {
    console.log("rtpCapabilities failed! Cannot consume.");
  } else {
    const { track } = await consumerTransport.consume({
      id: data.id,
      producerId: data.producerId,
      kind: data.kind,
      rtpParameters: data.rtpParameters,
    });

    track.onmute = (event) => {
      console.log("Track has been muted!");
    };

    remoteVideo.srcObject = new MediaStream([track]);

    socket.emitWithAck("resumeConsumer");
  }
};
