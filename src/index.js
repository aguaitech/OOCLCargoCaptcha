const { createCanvas, loadImage } = require("canvas");
const axios = require("axios");
const Crypto = require("crypto-js");
const fs = require("fs");

function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (e) {
    var t = (Math.random() * 16) | 0,
      i = e == "x" ? t : (t & 3) | 8;
    return i.toString(16);
  });
}

async function getCaptchaImage(uuid) {
  const { data: rawData } = await axios.get(
    `https://csdc-captcha.cargosmart.com/captcha/public/get?appKey=ec70110084084fbf866eace066e84f6c&captchaType=blockPuzzle&sessionKey=${uuid}&jsonpCallback=_`
  );
  const data = JSON.parse(rawData.slice(2).trim().slice(0, -1));
  return data.repData;
}

function saveDebugImages(captcha) {
  fs.writeFileSync(
    "bg.png",
    Buffer.from(captcha.originalImageBase64, "base64")
  );
  fs.writeFileSync(
    "jigsaw.png",
    Buffer.from(captcha.jigsawImageBase64, "base64")
  );
}

async function solveCaptcha(captcha) {
  const bgCanvas = createCanvas(310, 155);
  const jigsawCanvas = createCanvas(47, 155);
  const bgCtx = bgCanvas.getContext("2d");
  const jigsawCtx = jigsawCanvas.getContext("2d");
  const bgImage = await loadImage(
    "data:image/png;base64," + captcha.originalImageBase64
  );
  const jigsawImage = await loadImage(
    "data:image/png;base64," + captcha.jigsawImageBase64
  );
  bgCtx.drawImage(bgImage, 0, 0, 310, 155);
  jigsawCtx.drawImage(jigsawImage, 0, 0, 47, 155);
  const { data: jigsawBuffer } = jigsawCtx.getImageData(0, 0, 47, 155);
  let bottomRow = 0;
  let startCol = -1;
  let endCol = -1;
  for (let i = 154; i >= 0; i--) {
    let white = 0;
    let start = -1;
    let end = -1;
    for (let j = 0; j < 47; j++) {
      if (jigsawBuffer[(i * 47 + j) * 4 + 3] > 128) {
        white++;
        if (start < 0) {
          start = j;
        }
        end = j;
      }
    }
    if (white / 47 > 0.3) {
      bottomRow = i;
      startCol = start;
      endCol = end;
      break;
    }
  }
  const { data: bgBuffer } = bgCtx.getImageData(0, 0, 310, 155);
  let available = [];
  for (let j = startCol; j + endCol - startCol < 310; j++) {
    if (
      bgBuffer[(bottomRow * 310 + j) * 4] > 250 &&
      bgBuffer[(bottomRow * 310 + j) * 4 + 1] > 250 &&
      bgBuffer[(bottomRow * 310 + j) * 4 + 2] > 250 &&
      bgBuffer[(bottomRow * 310 + j + endCol - startCol) * 4] > 250 &&
      bgBuffer[(bottomRow * 310 + j + endCol - startCol) * 4 + 1] > 250 &&
      bgBuffer[(bottomRow * 310 + j + endCol - startCol) * 4 + 2] > 250
    ) {
      available.push(j);
    }
  }
  if (available.length !== 1) {
    return null;
  }
  return available[0];
}

async function getToken(uuid, captcha, move) {
  const endTime = new Date().getTime();
  const startTime = endTime - Math.round(Math.random() * 7000 + 3000);
  const data = {
    captchaType: "blockPuzzle",
    pointJson: enc(
      JSON.stringify({
        x: move + Math.random() - 0.5,
        y: 5,
      }),
      captcha.secretKey
    ),
    token: captcha.token,
    sessionKey: uuid,
    mousePoint: enc("[]", captcha.secretKey),
    startTime,
    endTime,
    manualMovementMousePoint: enc("[]", captcha.secretKey),
  };
  const { data: result } = await axios.post(
    "https://csdc-captcha.cargosmart.com/captcha/public/check?appKey=ec70110084084fbf866eace066e84f6c",
    data
  );
  if (result.repCode !== "0000") return null;
  return result.repData.token;
}

function enc(msg, k) {
  var k = Crypto.enc.Utf8.parse(k);
  var m = Crypto.enc.Utf8.parse(msg);
  var res = Crypto.AES.encrypt(m, k, {
    mode: Crypto.mode.ECB,
    padding: Crypto.pad.Pkcs7,
  });
  return res.toString();
}

async function autoSlideCaptcha() {
  const uuid = generateUUID();
  let retryCounter = 0;
  while (retryCounter < 3) {
    const captcha = await getCaptchaImage(uuid);
    // saveDebugImages(captcha);
    const move = await solveCaptcha(captcha);
    if (move === null) {
      retryCounter++;
      continue;
    }
    const token = await getToken(uuid, captcha, move);
    if (!token) {
      retryCounter++;
      continue;
    }
    return { uuid, token };
  }
  return false;
}

autoSlideCaptcha().then((result) => {
  console.log("finish:", result);
});
