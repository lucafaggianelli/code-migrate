#!/usr/bin/env bun

import { Glob } from "bun";
import fs from "fs/promises";
import fsSync from "fs";

import OpenAI from "openai";
import YAML from "yaml";

const openai = new OpenAI();

interface Config {
  prompt: string;
  glob?: string;
  contentMatchCriteria?: string[];
}

const parseConfig = () => {
  let configFile = "config.yml";

  if (!fsSync.existsSync("config.yml")) {
    configFile = "config.yaml";

    if (!fsSync.existsSync("config.yaml")) {
      throw new Error(
        "Config file is not found, please create a config.yml or config.yaml file."
      );
    }
  }

  const file = fsSync.readFileSync(configFile, "utf8");
  const c = YAML.parse(file) as Config;

  if (!c.prompt) {
    throw new Error("prompt is required in the config file.");
  }

  return c;
};
const config = parseConfig();

const createSystemMessage = (
  content: string
): OpenAI.Chat.Completions.ChatCompletionMessageParam => ({
  role: "system",
  content,
});

const createPrompt = (
  code: string
): OpenAI.Chat.Completions.ChatCompletionMessageParam => ({
  role: "user",
  content: `This is the code that you need to migrate:
\`\`\`
${code}
\`\`\`
`,
});

const askAi = async (prompt: string) => {
  const response = openai.chat.completions.create({
    messages: [createSystemMessage(config.prompt), createPrompt(prompt)],
    model: "gpt-4o-mini",
    temperature: 0,
  });

  return response;
};

const processFile = async (file: string) => {
  const content = await fs.readFile(file, { encoding: "utf-8" });
  const match = config.contentMatchCriteria
    ? config.contentMatchCriteria.some((criteria) => content.includes(criteria))
    : true;

  if (!match) {
    return;
  }

  console.log("Processing file:", file);
  const response = await askAi(content);

  console.log("File has been processed:", file);
  const migratedCode = response.choices[0].message.content;

  if (migratedCode) {
    await fs.writeFile(file, migratedCode, { encoding: "utf-8" });
  }
};

async function main() {
  if (process.argv.length < 3 || !process.argv[2]) {
    throw new Error("Please provide a path to scan.");
  }

  const scanPath = Bun.file(process.argv[2]);

  if (!scanPath.exists()) {
    throw new Error("The provided path does not exist.");
  }

  if ((await fs.lstat(scanPath.name!)).isDirectory()) {
    const glob = new Glob(config.glob || "**/*");

    for await (const file of glob.scan({
      absolute: true,
      onlyFiles: true,
      cwd: scanPath.name,
    })) {
      await processFile(file);
    }
  } else {
    await processFile(scanPath.name!);
  }
}

main();
