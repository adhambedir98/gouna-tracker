import { mount, loadJSON, labels, initialHash, setHash } from '../app.js';
import { mountFlow } from '../sflow.js';

const L = await labels('phones');
const app = await mount({
  page: 'phones',
  title: L("The phone's day")
});
const data = await loadJSON('data/phones.json');
app.content.innerHTML = `<section id="flow" style="margin-top:0"></section>`;
mountFlow({ host: document.getElementById('flow'), data, L, initial: initialHash(), setHash });
