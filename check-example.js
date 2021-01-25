// The MIT License (MIT)
//
// Copyright (c) 2014-2021 Camptocamp SA
//
// Permission is hereby granted, free of charge, to any person obtaining a copy of
// this software and associated documentation files (the "Software"), to deal in
// the Software without restriction, including without limitation the rights to
// use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
// the Software, and to permit persons to whom the Software is furnished to do so,
// subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
// FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
// COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
// IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
// CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

"use strict";

const path = require("path");
const puppeteer = require("puppeteer");

const arg = process.argv[2];
if (!arg) {
  throw new Error("Please provide a HTML file as the first argument");
}
const screenshot = !arg.startsWith("http");
const screenshotPath = screenshot ? `${arg}.png` : undefined;
const page_url = screenshot ? `http://localhost:3003/${arg}` : arg;

let browser;
const requestsURL = new Set();
const start = new Date();
let timeout = undefined;
let nbTiles = -1; // -1 to substract the capabilities
function loaded(page, browser) {
  if (timeout !== undefined) {
    clearTimeout(timeout);
  }
  timeout = setTimeout(async () => {
    if (requestsURL.size) {
      timeout = undefined;
      loaded(page, browser);
    } else {
      console.log(
        `Check finished in ${
          (new Date() - start) / 1000
        } seconds, with ${nbTiles} tiles`
      );
      if (screenshot) {
        timeout = setTimeout(async () => {
          page
            .screenshot({
              path: screenshotPath,
            })
            .then(
              async () => {
                console.log(`Screenshot saved at: ${screenshotPath}`);
                await browser.close();
              },
              async (e) => {
                console.log(`Screenshot error: ${e}`);
                await browser.close();
                process.exit(2);
              }
            );
        }, 500);
      } else {
        await browser.close();
      }
    }
  }, 500);
}
(async () => {
  browser = await puppeteer.launch();
  const page = await browser.newPage();

  await page.setViewport({ width: 1920 * 2, height: 1080 * 2 });
  await page.setRequestInterception(true);
  page.on("pageerror", async (e) => {
    console.log("Page error");
    console.log(e);
    await browser.close();
    process.exit(2);
  });
  page.on("request", (request) => {
    const originalUrl = request.url();
    requestsURL.add(originalUrl);
    if (originalUrl.startsWith("https://wmts.geo.admin.ch/")) {
      console.log(originalUrl);
      nbTiles += 1;
    }
    request.continue({
      originalUrl,
    });
  });
  page.on("requestfinished", async (request) => {
    const ci = process.env.CI == "true";
    const url = request.url();
    requestsURL.delete(url);
    loaded(page, browser);
  });
  page.on("requestfailed", async (request) => {
    const url = request.url();
    console.log(`Request failed on: ${url}`);
    await browser.close();
    process.exit(2);
  });
  await page.goto(page_url).catch(async (error) => {
    console.log(`Page load error: ${error}.`);
    await browser.close();
    process.exit(2);
  });
  loaded(page, browser);
})().catch(async (error) => {
  console.log(`Unexpected error: ${error}.`);
  await browser.close();
  process.exit(2);
});
