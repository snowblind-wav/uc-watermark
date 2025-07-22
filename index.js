const { Client, GatewayIntentBits, Partials } = require("discord.js");
const sharp = require("sharp");
const axios = require("axios");
const fs = require("fs/promises");
require("dotenv").config();

const TARGET_CHANNEL_ID = "1396914985237483582";
const WATERMARK_PATH = "./watermark.png";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel],
});

let watermarkBuffer;
let isBotReady = false;

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}!`);

  try {
    watermarkBuffer = await fs.readFile(WATERMARK_PATH);
    console.log("Watermark loaded successfully.");
  } catch (error) {
    console.error("Error loading watermark:", error);
    process.exit(1);
  }
  isBotReady = true;
  console.log(`Listening for images in channel ID: ${TARGET_CHANNEL_ID}`);
});

client.on("messageCreate", async (message) => {
  if (
    !isBotReady ||
    message.author.bot ||
    message.channel.id !== TARGET_CHANNEL_ID ||
    message.attachments.size === 0
  ) {
    return;
  }

  const attachment = message.attachments.first();

  if (attachment.contentType?.startsWith("image/")) {
    try {
      const imageBuffer = await axios
        .get(attachment.url, {
          responseType: "arraybuffer",
        })
        .then((res) => res.data);

      const imageMetadata = await sharp(imageBuffer).metadata();
      const watermarkMetadata = await sharp(watermarkBuffer).metadata();

      let finalWatermarkBuffer = watermarkBuffer;

      if (
        watermarkMetadata.width > imageMetadata.width ||
        watermarkMetadata.height > imageMetadata.height
      ) {
        finalWatermarkBuffer = await sharp(watermarkBuffer)
          .resize({
            width: imageMetadata.width,
            height: imageMetadata.height,
            fit: "inside",
          })
          .toBuffer();
      }

      const watermarkedBuffer = await sharp(imageBuffer)
        .composite([
          {
            input: finalWatermarkBuffer,
            tile: true,
          },
        ])
        .png()
        .toBuffer();

      await message.channel.send({
        files: [
          {
            attachment: watermarkedBuffer,
            name: `watermarked-${attachment.name}`,
          },
        ],
        content: `-# Posted by: <@${message.author.id}>`,
      });

      await message.delete();
    } catch (error) {
      console.error("Error processing image:", error);
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
