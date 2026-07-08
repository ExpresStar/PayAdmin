const fs = require('fs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;
const html = fs.readFileSync('index.html', 'utf8');
const dom = new JSDOM(html);
global.window = dom.window;
global.document = window.document;
global.localStorage = { getItem: () => null, setItem: () => {} };
global.fetch = () => Promise.resolve();

const code = fs.readFileSync('script.js', 'utf8');
const vm = require('vm');
const script = new vm.Script(code);
const context = vm.createContext(global);
script.runInContext(context);

try {
  const tx = global.generateSmartTransaction(0);
  console.log("Success:", tx);
} catch (e) {
  console.log("Error inside generateSmartTransaction:");
  console.error(e);
}
