import "./style.css";
import { io } from "socket.io-client";
import buttons from "./uiStuff/buttons";
import { Device } from "mediasoup-client";
import requestTransportToConsume from "../mediasoupFunctions/requestTransportToConsume";

const socket = io("http://localhost:5002");

let device = null;
let localStream = null;
let producerTransport = null;
let videoProducer = null;
let audioProducer = null;
const consumers = {};

socket.on("connect", () => {
  console.log("Connected!");
});

socket.on("updateActiveSpeakers", async (newListOfActives) => {
  const remoteEls = document.getElementsByClassName("remote-video");
  for (let el of remoteEls) {
    el.srcObject = null;
  }

  let slot = 0;
  newListOfActives.forEach((aid) => {
    if (aid !== audioProducer?.id) {
      const remoteVideo = document.getElementById("remote-video-" + slot);
      const remoteVideoUserName = document.getElementById("username-" + slot);
      const consumerForThisSlot = consumers[aid];
      remoteVideo.srcObject = consumerForThisSlot?.combinedStream;
      remoteVideoUserName.innerHTML = consumerForThisSlot?.userName;
      slot++;
    }
  });
});

socket.on("newProducersToConsume", async (consumeData) => {
  requestTransportToConsume(consumeData, device, socket, consumers);
});

const joinRoom = async () => {
  const userName = document.getElementById("username").value;
  const roomName = document.getElementById("room-input").value;

  const joinRoomResponse = await socket.emitWithAck("joinRoom", {
    userName,
    roomName,
  });

  console.log(joinRoomResponse);

  device = new Device();
  await device.load({
    routerRtpCapabilities: joinRoomResponse.routerRtpCapabilities,
  });

  // create consumer transport
  requestTransportToConsume(joinRoomResponse, device, socket, consumers);

  buttons.control.classList.remove("d-none");
};

const enableFeed = async () => {
  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true,
  });
  buttons.localMediaLeft.srcObject = localStream;
  buttons.enableFeed.disabled = true;
  buttons.sendFeed.disabled = false;
  buttons.muteBtn.disabled = false;
};

const sendFeed = async () => {
  // create a transport for this client's upstream
  // it will handle both audio and video producers
  const producerTransportParams = await socket.emitWithAck("requestTransport", {
    type: "producer",
  }); // ask the server to make a transport and send params

  producerTransport = await device.createSendTransport(producerTransportParams);

  // the transport connect event will not fire until we call transport.produce
  producerTransport.on(
    "connect",
    async ({ dtlsParameters }, callback, errback) => {
      console.log("Connect event fired!");
      const connectRes = await socket.emitWithAck("connectTransport", {
        dtlsParameters,
        type: "producer",
      });

      if (connectRes === "success") {
        callback();
      } else if (connectRes === "error") {
        errback();
      }
    }
  );
  producerTransport.on("produce", async (parameters, callback, errback) => {
    const { kind, rtpParameters } = parameters;
    const produceRes = await socket.emitWithAck("startProducing", {
      kind,
      rtpParameters,
    });

    console.log(produceRes);

    if (produceRes === "error") {
      callback();
    } else {
      callback(produceRes);
    }
  });

  // create our producer
  const videoTrack = localStream.getVideoTracks()[0];
  const audioTrack = localStream.getAudioTracks()[0];
  try {
    // running the produce method will tell the transport to fire connect
    console.log("Start producing video");
    videoProducer = await producerTransport.produce({
      track: videoTrack,
    });
    console.log("Start producing audio");
    audioProducer = await producerTransport.produce({
      track: audioTrack,
    });

    buttons.hangUp.disabled = false;
  } catch (error) {
    console.log(error);
  }
};

const muteAudio = () => {
  if (audioProducer.paused) {
    audioProducer.resume();
    buttons.muteBtn.innerText = "Audio On";
    buttons.muteBtn.classList.add("btn-success");
    buttons.muteBtn.classList.remove("btn-danger");
    socket.emit("audioChange", "unmute");
  } else {
    audioProducer.pause();
    buttons.muteBtn.innerText = "Audio Off";
    buttons.muteBtn.classList.remove("btn-success");
    buttons.muteBtn.classList.add("btn-danger");
    socket.emit("audioChange", "mute");
  }
};

buttons.joinRoom.addEventListener("click", joinRoom);
buttons.enableFeed.addEventListener("click", enableFeed);
buttons.sendFeed.addEventListener("click", sendFeed);
buttons.muteBtn.addEventListener("click", muteAudio);
