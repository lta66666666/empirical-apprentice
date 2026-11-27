import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const checks = [];
const add = (check, pass, detail = '') => checks.push({ check, pass, detail });
const readText = path => readFileSync(join(root, path), 'utf8');
const sha256 = path => createHash('sha256').update(readFileSync(join(root, path))).digest('hex');

const REAL_DATA = 'static/real-data/world-bank-china-2000-2023.csv';
const REAL_HASH = '504602230ad052d9fd24a5db10b8f3524bce9011fa96f7c59eea0173b3b0542e';
add('real data hash', sha256(REAL_DATA) === REAL_HASH, REAL_DATA);
if (existsSync(join(root, 'docs/evidence/real-data/world-bank-china-2000-2023.csv'))) {
  add('evidence copy hash', sha256('docs/evidence/real-data/world-bank-china-2000-2023.csv') === REAL_HASH);
}
if (existsSync(join(root, 'docs/evidence/data/SOURCE_CARD.md'))) {
  add('source card records hash', readText('docs/evidence/data/SOURCE_CARD.md').includes(REAL_HASH));
}
add('real data page records hash', readText('static/real-data-demo.html').includes(REAL_HASH));

const requiredPages = [
  'static/auth.html',
  'static/index.html',
  'static/judge-guide.html',
  'static/random-did-demo.html',
  'static/local-assistant-guide.html',
  'static/real-data-demo.html',
  'static/beginner-demo.html',
];
for (const page of requiredPages) add(`page exists: ${page}`, existsSync(join(root, page)));

const htmlFiles = [];
function walk(folder) {
  for (const name of readdirSync(join(root, folder))) {
    const rel = `${folder}/${name}`;
    if (statSync(join(root, rel)).isDirectory()) walk(rel);
    else if (name.endsWith('.html')) htmlFiles.push(rel);
  }
}
walk('static');
add('static html found', htmlFiles.length > 0, `${htmlFiles.length} pages`);

const forbidden = ['评委', '分值', '评分表'];
for (const page of htmlFiles) {
  const text = readText(page);
  for (const phrase of forbidden) {
    add(`no forbidden copy "${phrase}" in ${page}`, !text.includes(phrase));
  }
  const broken = [];
  for (const match of text.matchAll(/(?:href|src)="(\/static\/[^"#?]+)/g)) {
    const asset = match[1].slice(1);
    if (!existsSync(join(root, asset))) broken.push(match[1]);
  }
  add(`static asset links resolve in ${page}`, broken.length === 0, broken.join(', '));
}

const auth = readText('static/auth.html');
add('auth keeps original capability lead', auth.includes('云端 Stata 语法计算'));
add('auth links to beginner demo', auth.includes('href="/static/beginner-demo.html"'));
add('auth has guided learning path', auth.includes('auth-path') && auth.includes('提出问题') && auth.includes('形成成果'));
add('auth has password visibility control', auth.includes('id="togglePassword"'));

const judge = readText('static/judge-guide.html');
add('guide keeps neutral title', judge.includes('5 分钟验收指南'));

const index = readText('static/index.html');
add('home states Stata is not executed here', index.includes('Stata</strong>：只生成对应代码，不在本站执行。'));
add('materials link to real data evidence', index.includes('href="/static/real-data-demo.html"'));

const home = readText('static/home.html');
add('home links to real data evidence', home.includes('href="/static/real-data-demo.html"'));
add('home links to beginner demo', home.includes('href="/static/beginner-demo.html"'));
add('home explains engine choices', home.includes('三种计算方式怎么选') && home.includes('不需要本机 Stata'));

const layout = readText('static/module-layout.js');
add('directory recommends zero-basis stage 1', layout.includes('零基础推荐') && layout.includes('零基础开始阶段 1'));
add('directory keeps local Stata optional', layout.includes('进阶 · 本机 Stata') && layout.includes('不是完成课程的必经步骤'));

const stataGuide = readText('static/stata-guide.js');
add('Stata guide stays in overflow menu', stataGuide.includes("document.querySelector('.coach-menu')") && !stataGuide.includes("||document.querySelector('.module-toolbar')"));

const beginner = readText('static/beginner-demo.html');
add('beginner demo labels static simulation', beginner.includes('静态教学演示') && beginner.includes('不是本次实时计算'));
add('beginner demo explains Stata is optional', beginner.includes('本机 Stata 18 是可选进阶'));
add('beginner demo links its script', beginner.includes('beginner-demo.js'));

const randomDid = readText('static/random-did-demo.html');
add('random DID has plain-language reading card', randomDid.includes('这个数字怎么读') && randomDid.includes('能证明因果吗'));

const realDataPage = readText('static/real-data-demo.html');
add('real data page has copy control', realDataPage.includes('id="copyHash"') && realDataPage.includes('real-data-actions.js'));

const authCss = readText('static/auth.css');
add('password hint is neutral until invalid', authCss.includes('.password-match.is-invalid'));

const workspace = readText('static/conversation-workspace.js');
add('gap actions append buttons instead of stringifying', workspace.includes("actions.append(button('我来补'") && !workspace.includes("el('div','coach-gap-actions',button"));

// 省赛前入口打磨：favicon、OG、品牌 404、R.wasm 预压缩与 README 时效性。
const favicon = 'static/favicon.svg';
add('favicon asset exists', existsSync(join(root, favicon)));
for (const p of requiredPages.concat(['static/home.html'])) {
  add(`favicon linked in ${p}`, readText(p).includes('href="/static/favicon.svg"'));
}
add('public pages carry og tags', readText('static/auth.html').includes('property="og:title"'));
add('branded 404 page exists', existsSync(join(root, 'static/404.html')) && readText('static/404.html').includes('零基础体验'));
add('worker serves branded 404', readText('worker/index.js').includes('notFound(request)') && readText('worker/index.js').includes("path==='/favicon.ico'"));
add('wasm precompressed payload exists', existsSync(join(root, 'static/webr/R.wasm.gz')));
add('webr init shows download hint', readText('static/ui-refinement.js').includes('首次使用需下载运行环境'));
add('README no longer claims self-signed cert', !readText('README.md').includes('自签名证书'));
add('README points to tencent deployment', readText('README.md').includes('deploy/tencent/README.md'));
add('README unfinished items reflect current status', !readText('README.md').includes('JoyCode登录') && readText('README.md').includes('独立新手试用'));
add('guide reflects Linux deployment verified', !readText('static/judge-guide.html').includes('Linux 部署仍未验收'));
add('guide names cloud StatsPAI', readText('static/judge-guide.html').includes('云端 StatsPAI'));

// 美化层：GSAP vendor 完整性、polish/motion 接线与无外部 CDN 运行时。
add('gsap vendored with license', existsSync(join(root, 'static/vendor/gsap/gsap.min.js')) && existsSync(join(root, 'static/vendor/gsap/LICENSE')));
const gsapSize = existsSync(join(root, 'static/vendor/gsap/gsap.min.js')) ? statSync(join(root, 'static/vendor/gsap/gsap.min.js')).size : 0;
add('gsap vendor size sanity', gsapSize > 60000 && gsapSize < 100000, `size=${gsapSize}`);
add('polish layer assets exist', existsSync(join(root, 'static/ui/polish.css')) && existsSync(join(root, 'static/ui/motion.js')));
for (const p of ['static/home.html', 'static/index.html', 'static/auth.html', 'static/beginner-demo.html']) {
  add(`polish wired in ${p}`, readText(p).includes('/static/ui/polish.css') && readText(p).includes('/static/ui/motion.js'));
}
add('motion respects reduced motion', readText('static/ui/motion.js').includes('prefers-reduced-motion'));
add('no external runtime CDN scripts', !requiredPages.concat(['static/home.html', 'static/404.html']).map(p => readText(p)).join('\n').match(/<script[^>]+src="https?:\/\//));

const failed = checks.filter(check => !check.pass);
console.log(JSON.stringify({ scope: 'source copy, evidence hash and static link integrity; not deployment acceptance', checks }, null, 2));
if (failed.length) process.exitCode = 1;
