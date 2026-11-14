import { createServer } from "node:http";
import { chromium } from "playwright";

const server = createServer((_request, response) => {
  response.setHeader("content-type", "text/html");
  response.end("<title>No gesture here</title><p>Nobody clicked this page.</p>");
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}/`;

// Read the flag through CDP with userGesture: false, since Playwright's own evaluate grants activation.
async function hasBeenActive(context, page) {
  const cdp = await context.newCDPSession(page);
  const { result } = await cdp.send("Runtime.evaluate", {
    expression: "navigator.userActivation.hasBeenActive",
    returnByValue: true,
    userGesture: false,
  });
  await cdp.detach();
  return result.value;
}

const browser = await chromium.launch();
const results = {};

for (const tracing of [false, true]) {
  const context = await browser.newContext();
  if (tracing) await context.tracing.start({ snapshots: true });
  const page = await context.newPage();
  await page.goto(url);
  // Give any work Playwright runs on the load event time to land.
  await new Promise((resolve) => setTimeout(resolve, 500));
  results[tracing ? "with tracing" : "without tracing"] = await hasBeenActive(context, page);
  if (tracing) await context.tracing.stop();
  await context.close();
}

await browser.close();
server.close();

for (const [name, active] of Object.entries(results)) {
  console.log(`${name}: navigator.userActivation.hasBeenActive = ${active}`);
}

if (results["with tracing"]) {
  console.log("BUG: tracing marked a page nobody interacted with as user-activated.");
  process.exitCode = 1;
}
