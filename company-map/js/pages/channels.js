import { mount, loadJSON, labels, initialHash, setHash } from '../app.js';
import { mountFlow } from '../sflow.js';

const L = await labels('channels');
const app = await mount({
  page: 'channels',
  title: L('How the process works')
});
const data = await loadJSON('data/channels.json');
app.content.innerHTML = `<section id="flow" style="margin-top:0"></section>`;
mountFlow({ host: document.getElementById('flow'), data, L, initial: initialHash(), setHash });
