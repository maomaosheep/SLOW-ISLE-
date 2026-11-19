const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname,'../miniprogram');
const compiler = process.env.WECHAT_COMPILER_DIR || 'C:/Program Files (x86)/Tencent/微信web开发者工具/code/package.nw/node_modules/wcc-exec';
const output = path.resolve(__dirname,'../output/test-artifacts');
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(item=>item.isDirectory()?walk(path.join(dir,item.name)):[path.join(dir,item.name)]);}
fs.mkdirSync(output,{recursive:true});
const files=walk(root).map(file=>'./'+path.relative(root,file).replaceAll('\\','/'));
for(const [binary,extension,name] of [['wcc.exe','.wxml','compiled-wxml.js'],['wcsc.exe','.wxss','compiled-wxss.js']]){
  const inputs=files.filter(file=>file.endsWith(extension));
  const result=execFileSync(path.join(compiler,binary),['-o',path.join(output,name),...inputs],{cwd:root,encoding:'utf8'});
  if(result.trim())console.log(result);
  if(!fs.statSync(path.join(output,name)).size)throw new Error('Empty compiler output');
  console.log(`${binary}: compiled ${inputs.length} ${extension} files successfully.`);
}
