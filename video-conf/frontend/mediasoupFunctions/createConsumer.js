const createConsumer = async (
  consumerTransport,
  rtpCapabilities,
  pid,
  kind,
  socket
) => {
  const consumerParams = await socket.emitWithAck("consumeMedia", {
    rtpCapabilities,
    pid,
    kind,
  });

  if (consumerParams === "cannotConsume") {
    console.log("Cannot consume!");
  } else if (consumerParams === "consumeFailed") {
    console.log("Consume failed!");
  } else {
    const consumer = await consumerTransport.consume(consumerParams);
    console.log("consume() has finished!");
    const { track } = consumer;

    // unpause
    await socket.emitWithAck("unpauseConsumer", { pid, kind });

    return consumer;
  }
};

export default createConsumer;
