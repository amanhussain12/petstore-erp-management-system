import {readdirSync,statSync} from 'node:fs';import {spawnSync} from 'node:child_process';
function all(dir){return readdirSync(dir).flatMap(f=>{let p=dir+'/'+f;return statSync(p).isDirectory()?all(p):[p]}).filter(x=>x.endsWith('.js'))}
let files=[...all('src'),...all('public'),...all('scripts'),...all('tests')];let errors=0;for(let f of files){let x=spawnSync(process.execPath,['--check',f],{encoding:'utf8'});if(x.status!==0){errors++;console.error(f,x.stderr)}}console.log(`Checked ${files.length} JS files; ${errors} syntax errors`);if(errors)process.exitCode=1;

// Keep frontend asset references aligned with actual files. Prevent HTML-as-CSS regressions on Vercel.
const {readFileSync,existsSync}=await import('node:fs');
const html=readFileSync('public/index.html','utf8');
for(const match of html.matchAll(/(?:href|src)=["']\/([^"'?#]+)(?:\?[^"']*)?["']/g)){
 const asset='public/'+match[1];
 if(!existsSync(asset)){errors++;console.error('Missing referenced browser asset: '+asset)}
}
if(errors)process.exitCode=1;
