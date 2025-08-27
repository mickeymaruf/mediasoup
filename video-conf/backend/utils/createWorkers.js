const mediasoup = require("mediasoup");
const os = require("os");
const totalThreads = os.cpus().length;

const createWorkers = () =>
  new Promise(async (resolve, reject) => {
    let workers = [];

    for (let i = 0; i < totalThreads; i++) {
      const worker = await mediasoup.createWorker({
        rtcMinPort: 40000,
        rtcMaxPort: 41000,
        logLevel: "warn",
        logTags: ["info", "ice", "dtls", "rtp", "srtp", "rtcp"],
      });

      worker.on("died", () => {
        console.log("Worker has died!");
        process.exit(1);
      });

      workers.push(worker);
    }

    resolve(workers);
  });

module.exports = createWorkers;
