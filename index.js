const { Client, GatewayIntentBits, Partials, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require("discord.js");
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

      const fileName = `watermarked-${attachment.name}`;
      
      const deleteButton = new ButtonBuilder()
        .setCustomId(`delete_${message.author.id}`)
        .setLabel('Delete')
        .setStyle(ButtonStyle.Danger);
      
      const row = new ActionRowBuilder().addComponents(deleteButton);

      let responseContent = `-#Image from <@${message.author.id}>`;
      if (message.content) {
        responseContent = `> ${message.content}\n${responseContent}`;
      }

      await message.channel.send({
        content: responseContent,
        files: [
          {
            attachment: watermarkedBuffer,
            name: fileName,
          },
        ],
        components: [row],
      });

      await message.delete();
    } catch (error) {
      console.error("Error processing image:", error);
    }
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  const [action, targetUserId] = interaction.customId.split("_");

  if (action === "delete") {
    if (interaction.user.id === targetUserId) {
      try {
        await interaction.deferUpdate();
        await interaction.message.delete();
      } catch (error) {
        console.error("Failed to delete message on interaction:", error);
      }
    } else {
      await interaction.reply({
        content: "Only the original poster can delete this.",
        ephemeral: true,
      });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);