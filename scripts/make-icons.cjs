const sharp = require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const path = require('node:path');
const icons={
  store:'<path d="M3 9l2-6h14l2 6v3a3 3 0 0 1-5 2 3 3 0 0 1-4 0 3 3 0 0 1-4 0 3 3 0 0 1-5-2Z M4 14v7h16v-7 M9 21v-6h6v6 M3 9h18"/>',
  pin:'<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  phone:'<path d="M7 3H4v3c0 8 6 14 14 14h3v-4l-5-2-2 3a13 13 0 0 1-7-7l3-2Z"/>',
  home:'<path d="M3 10 12 3l9 7v10H3Z M9 20v-7h6v7"/>',
  cup:'<path d="M5 8h12v8a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5Z M17 9h2a3 3 0 0 1 0 6h-2 M8 2v3 M13 2v3"/>',
  order:'<path d="M5 3h14v18l-3-2-4 2-4-2-3 2Z M8 8h8 M8 12h8 M8 16h4"/>',
  user:'<circle cx="12" cy="7" r="4"/><path d="M4 21v-3a8 8 0 0 1 16 0v3Z"/>'
};
(async()=>{
  for(const [name,shape] of Object.entries(icons))for(const active of (['store','pin','phone'].includes(name)?[false]:[false,true])){
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="72" height="72" fill="none" stroke="${active?'#302720':'#82776c'}" stroke-width="${active?1.9:1.4}" stroke-linecap="round" stroke-linejoin="round">${shape}</svg>`;
    await sharp(Buffer.from(svg)).png().toFile(path.resolve(__dirname,`../miniprogram/assets/${name}${active?'-active':''}.png`));
  }
  console.log('Generated native navigation and profile icons.');
})().catch(e=>{console.error(e);process.exitCode=1});
