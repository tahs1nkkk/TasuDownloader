"use strict";
const versions = require("../../shared/core/version.js");
const { VERSION: downloadContractVersion } = require("../../shared/core/download-contract.js");

function iosBuild(runNumber = process.env.TASU_BUILD_NUMBER) {
  const [major, minor, patch] = versions.platforms.ios.split(".").map(Number);
  if (runNumber == null || runNumber === "") return { version: versions.platforms.ios, buildNumber: "1" };
  if (!/^[1-9][0-9]*$/.test(String(runNumber)) || !Number.isSafeInteger(Number(runNumber))) {
    throw new Error("Invalid TASU_BUILD_NUMBER: expected a positive integer.");
  }
  const nextPatch = patch + Number(runNumber);
  if (!Number.isSafeInteger(nextPatch)) throw new Error("iOS patch version exceeds the safe integer range.");
  return { version: `${major}.${minor}.${nextPatch}`, buildNumber: String(runNumber) };
}

function buildInfo(platform) {
  if (!Object.hasOwn(versions.platforms, platform) || !versions.platforms[platform]) {
    throw new Error(`No implemented build for ${platform}`);
  }
  const ios = platform === "ios" ? iosBuild() : null;
  return {
    platform,
    platformVersion: ios ? ios.version : versions.platforms[platform],
    coreVersion: versions.coreVersion,
    downloadContractVersion,
    ...(ios ? { buildNumber: ios.buildNumber } : {})
  };
}
module.exports = { versions, iosBuild, buildInfo };
