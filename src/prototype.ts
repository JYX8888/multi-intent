import { runPrototype } from "./agent/prototype-agent.js";

const input = process.argv.slice(2).join(" ") || "小诺，我今天早上空腹称了一下体重是80kg，比前几天感觉没怎么降，有点担心是不是平台期了；另外上午测了一次尿酮，试纸大概是2+，颜色比昨天深一点；中午因为在外面吃饭，吃了一碗面，还加了几口青菜和一点牛肉，不太确定这顿对我现在的减重方案有没有影响，麻烦你一起帮我看看体重、尿酮和这顿饭的问题。";

console.log(`[prototype] 用户输入：${input}`);

const result = await runPrototype(input);

console.log("\n[prototype] Agent Events:");
for (const event of result.events) {
  console.log(`- ${event.type}${event.detail ? `: ${event.detail}` : ""}`);
}

console.log("\n[prototype] 最终回复:");
console.log(result.finalText);
