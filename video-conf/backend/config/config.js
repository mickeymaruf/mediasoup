const config = {
  mediaCodecs: [
    {
      kind: "audio",
      mimeType: "audio/opus",
      clockRate: 48000,
      channels: 2,
    },
    {
      kind: "video",
      mimeType: "video/H264",
      clockRate: 90000,
      parameters: {
        "packetization-mode": 1,
        "profile-level-id": "42e01f",
        "level-asymmetry-allowed": 1,
      },
    },
    {
      kind: "video",
      mimeType: "video/VP8",
      clockRate: 90000,
      parameters: {},
    },
  ],
  //For a typical video stream with HD quality, you might set maxIncomingBitrate
  //around 5 Mbps (5000 kbps) to balance quality and bandwidth.
  //4K Ultra HD: 15 Mbps to 25 Mbps
  maxIncomingBitrate: 5000000, // 5 Mbps, default is INF
  initialAvailableOutgoingBitrate: 5000000, // 5 Mbps, default is 600000
};

module.exports = config;
