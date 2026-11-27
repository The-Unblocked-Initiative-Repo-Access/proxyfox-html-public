#!/usr/bin/env node
// Builds the /study tutorial pages for the Ashcobe Academy cover site (Applied Computing course notes;
// the sitemap lists them). Real, readable tutorials in the front page's style, so the cover holds up when a
// crawler follows the links. Run: node study/_build.mjs  (writes study/<slug>.html, robots.txt,
// sitemap.xml at the repo root).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const SITE = 'https://pr0xyfox.dev';

// slug: [title, category, lead, [ [heading, html], ... ] ]
const code = (s) => `<pre><code>${s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`;
const T = {
  http: ['HTTP', 'Networking', 'HTTP is the language browsers and servers use to talk. Every page you open, every image that loads, every form you submit is one or more HTTP requests and the responses that come back.', [
    ['Requests and responses', '<p>A client sends a <b>request</b>: a method, a path, some headers, and sometimes a body. The server sends a <b>response</b>: a status code, headers, and usually a body. That is the whole conversation.</p>' + code('GET /index.html HTTP/1.1\nHost: example.com\nAccept: text/html\n\nHTTP/1.1 200 OK\nContent-Type: text/html\nContent-Length: 1256')],
    ['Methods', '<p><code>GET</code> asks for something, <code>POST</code> sends data, <code>PUT</code> and <code>PATCH</code> change something, <code>DELETE</code> removes it, and <code>HEAD</code> asks for just the headers. GET and HEAD should never change anything on the server.</p>'],
    ['Status codes', '<p>The first digit tells you the category: <b>2xx</b> worked, <b>3xx</b> is a redirect, <b>4xx</b> is your fault (404 Not Found, 403 Forbidden), and <b>5xx</b> is the server\'s fault. You will memorize the common ones fast: 200, 301, 404, 500.</p>'],
    ['Headers', '<p>Headers carry the details: <code>Content-Type</code> says what the body is, <code>Cache-Control</code> says how long to keep it, <code>Authorization</code> carries credentials. Both the request and the response have them.</p>'],
  ]],
  tcp: ['TCP/IP', 'Networking', 'Underneath HTTP is TCP/IP, the pair of protocols that actually move the bytes. IP gets a packet to the right machine; TCP makes sure the bytes arrive in order and none go missing.', [
    ['IP addresses and ports', '<p>An IP address names a machine (like <code>93.184.216.34</code>); a port names a program on it (web servers usually listen on 80 and 443). Together they are an endpoint.</p>'],
    ['The handshake', '<p>Before any data moves, TCP does a three-step handshake: <code>SYN</code>, <code>SYN-ACK</code>, <code>ACK</code>. After that both sides have an open connection they can send bytes over in either direction.</p>'],
    ['Packets and reliability', '<p>Data is split into packets. Each gets a sequence number so the other end can put them back in order and ask again for any that go missing. You get a clean stream of bytes without worrying about any of that.</p>'],
  ]],
  dns: ['DNS', 'Networking', 'DNS is the internet\'s phone book. You type a name like example.com; DNS turns it into the IP address your computer actually connects to.', [
    ['How a lookup works', '<p>Your computer asks a <b>resolver</b>, which asks the <b>root</b> servers, then the <b>.com</b> servers, then the server responsible for the domain itself, caching the answer along the way so the next lookup is instant.</p>'],
    ['Record types', '<p><code>A</code> maps a name to an IPv4 address, <code>AAAA</code> to IPv6, <code>CNAME</code> points one name at another, <code>MX</code> names the mail servers, and <code>TXT</code> holds arbitrary text (often used to prove you own a domain).</p>' + code('example.com.      A      93.184.216.34\nwww.example.com.  CNAME  example.com.')],
    ['TTL and caching', '<p>Every record has a time-to-live that says how many seconds it may be cached. Lower it before you plan to change a record, so the change spreads quickly.</p>'],
  ]],
  tls: ['TLS / HTTPS', 'Networking', 'TLS is what puts the "S" in HTTPS. It encrypts the connection so nobody between you and the server can read or change what you send.', [
    ['What it protects', '<p>Two things: <b>privacy</b> (an eavesdropper sees only scrambled bytes) and <b>integrity</b> (nobody can tamper with the data without you noticing). It also proves you are really talking to the site you meant to.</p>'],
    ['Certificates', '<p>A server presents a certificate signed by a trusted authority. Your browser checks the signature and the name on it. If it does not match the site, you get a warning.</p>'],
    ['The handshake', '<p>Client and server agree on a cipher, verify the certificate, and work out a shared key using public-key cryptography. After that, everything is encrypted with that key. TLS 1.3 does this in a single round trip.</p>'],
  ]],
  websockets: ['WebSockets', 'Networking', 'A normal HTTP request is one-and-done: ask, get an answer, close. WebSockets keep a connection open so the server and the page can send messages whenever they want.', [
    ['Why they exist', '<p>For anything live, chat, game state, a stock ticker, polling the server over and over is wasteful and slow. A WebSocket stays open so either side can push a message the instant it has one.</p>'],
    ['The upgrade', '<p>It starts as a normal HTTP request with an <code>Upgrade: websocket</code> header. If the server agrees, the same TCP connection switches to the WebSocket protocol and stays open.</p>' + code("const ws = new WebSocket('wss://example.com/socket');\nws.onmessage = (e) => console.log('got', e.data);\nws.onopen = () => ws.send('hello');")],
    ['Messages', '<p>After the upgrade, both sides send discrete messages (text or binary) in small framed chunks. No status codes, no headers per message, just data.</p>'],
  ]],
  html: ['HTML &amp; CSS', 'Web', 'HTML is the structure of a web page; CSS is how it looks. Together they turn plain content into something laid out and styled.', [
    ['Elements', '<p>HTML is a tree of elements written as tags. A heading, a paragraph, a link, an image, each is an element, and they nest inside one another.</p>' + code('<h1>Title</h1>\n<p>A paragraph with a <a href="/about">link</a>.</p>\n<img src="photo.jpg" alt="A photo">')],
    ['CSS basics', '<p>CSS rules pick elements with a <b>selector</b> and set properties on them. You can select by tag, class, or id.</p>' + code('p { color: #333; line-height: 1.6; }\n.button { background: #2864d7; color: white; padding: 8px 14px; }')],
    ['Layout', '<p>Modern layouts use <b>flexbox</b> for rows and columns and <b>grid</b> for two-dimensional layouts. Media queries adjust the design for small screens.</p>'],
  ]],
  javascript: ['JavaScript', 'Web', 'JavaScript is the language that makes web pages interactive. It runs in every browser and, these days, on servers too.', [
    ['Variables and types', '<p>Declare values with <code>let</code> and <code>const</code>. The core types are numbers, strings, booleans, arrays, objects, <code>null</code> and <code>undefined</code>.</p>' + code("const name = 'Ada';\nlet count = 0;\nconst list = [1, 2, 3];\nconst user = { name, age: 36 };")],
    ['Functions', '<p>Functions group code you want to reuse. Arrow functions are a short way to write them.</p>' + code('function add(a, b) { return a + b; }\nconst double = (n) => n * 2;')],
    ['The DOM', '<p>In the browser, JavaScript changes the page through the DOM, the live tree of elements. You find elements, read them, change them, and react to events.</p>' + code("document.querySelector('#go').addEventListener('click', () => {\n  document.body.style.background = '#eef';\n});")],
    ['Promises and async', '<p>Anything that takes time, loading data, waiting for a response, returns a promise. <code>async</code>/<code>await</code> lets you write it like ordinary step-by-step code.</p>' + code("async function load() {\n  const res = await fetch('/data.json');\n  return res.json();\n}")],
  ]],
  python: ['Python', 'Programming', 'Python is a clear, readable language that is a popular first language and is used everywhere from small scripts to large applications.', [
    ['Variables and types', '<p>No type declarations: you just assign. The basics are numbers, strings, lists, dictionaries, and booleans.</p>' + code("name = 'Ada'\ncount = 0\nitems = [1, 2, 3]\nuser = {'name': name, 'age': 36}")],
    ['Control flow', '<p>Indentation defines blocks, there are no braces. <code>if</code>/<code>elif</code>/<code>else</code> for choices, <code>for</code> and <code>while</code> for loops.</p>' + code('for n in range(5):\n    if n % 2 == 0:\n        print(n, "is even")')],
    ['Functions', '<p>Define reusable code with <code>def</code>.</p>' + code('def greet(name):\n    return f"Hello, {name}!"\n\nprint(greet("world"))')],
    ['Files', '<p>Open a file with <code>with</code> so it closes itself.</p>' + code("with open('notes.txt') as f:\n    for line in f:\n        print(line.strip())")],
  ]],
  node: ['Node.js', 'JavaScript', 'Node.js lets you run JavaScript outside the browser, on servers, on the command line, anywhere. The language is the same; the surroundings are different.', [
    ['Modules and npm', '<p>Code is organized into modules you import. <b>npm</b> installs packages other people wrote.</p>' + code("npm init -y\nnpm install express")],
    ['A small server', '<p>Node ships with everything needed to answer HTTP requests.</p>' + code("import http from 'node:http';\nhttp.createServer((req, res) => {\n  res.end('Hello from Node');\n}).listen(3000);")],
    ['Working with files', '<p>The <code>fs</code> module reads and writes files; most of its functions have a promise version.</p>' + code("import { readFile } from 'node:fs/promises';\nconst text = await readFile('data.txt', 'utf8');")],
  ]],
  git: ['Git', 'Tools', 'Git tracks the history of your project: every change, who made it, and when. It also lets several people work on the same code without stepping on each other.', [
    ['The basics', '<p>You <b>stage</b> changes, then <b>commit</b> them with a message. Each commit is a snapshot you can return to.</p>' + code('git add .\ngit commit -m "Add the login page"')],
    ['Branches', '<p>A branch is a separate line of work. Make one, change things, then merge it back when it is ready.</p>' + code('git checkout -b new-feature\n# ...make changes, commit...\ngit checkout main\ngit merge new-feature')],
    ['Remotes', '<p>A remote is a copy of the repository somewhere else, usually a service like GitHub. You <code>push</code> your commits to it and <code>pull</code> other people\'s down.</p>' + code('git push origin main\ngit pull')],
  ]],
  cli: ['The Command Line', 'Tools', 'The command line is a text way to run your computer. It feels bare at first, but a handful of commands get you a long way, and it is faster than clicking once you know them.', [
    ['Moving around', '<p><code>pwd</code> shows where you are, <code>ls</code> lists what is here, <code>cd</code> moves into a folder.</p>' + code('pwd\nls -la\ncd projects/website')],
    ['Files', '<p>Make, move, copy, and remove files and folders.</p>' + code('mkdir notes\ntouch notes/todo.txt\ncp todo.txt todo.bak\nrm todo.bak')],
    ['Pipes', '<p>The real power: send one command\'s output into another with <code>|</code>.</p>' + code("cat access.log | grep 404 | wc -l")],
  ]],
  linux: ['Linux', 'Systems', 'Linux is the operating system that runs most of the internet\'s servers. If you deploy anything, you will meet it.', [
    ['Files and permissions', '<p>Everything is a file, and every file has an owner and permissions: read, write, execute, for the owner, the group, and everyone.</p>' + code('ls -l\nchmod 644 notes.txt\nchown ada notes.txt')],
    ['Processes', '<p>Running programs are processes. List them, find a heavy one, stop it.</p>' + code('ps aux\ntop\nkill 12345')],
    ['Packages', '<p>Software is installed from package managers. On Debian and Ubuntu that is <code>apt</code>.</p>' + code('sudo apt update\nsudo apt install nginx')],
  ]],
  servers: ['Web Servers', 'Networking', 'A web server is the program that listens for HTTP requests and sends back pages, images, and data. Nginx and Apache are the common ones.', [
    ['What it does', '<p>It waits on a port, accepts connections, works out which file or program should answer each request, and sends the response. It also handles TLS, caching, and compression.</p>'],
    ['Static vs dynamic', '<p>A <b>static</b> site is just files the server hands back as-is. A <b>dynamic</b> site runs a program per request to build the page, often passing the request to an application behind the server.</p>'],
    ['A reverse proxy', '<p>Servers often sit in front of an application and forward requests to it, adding TLS and caching on the way. That is a reverse proxy.</p>' + code('location / {\n    proxy_pass http://localhost:3000;\n}')],
  ]],
  databases: ['Databases', 'Data', 'A database stores your data in a way you can search, update, and rely on. Almost every real application has one behind it.', [
    ['Tables and rows', '<p>A relational database organizes data into tables of rows and columns, like a spreadsheet with rules. Each table holds one kind of thing: users, orders, posts.</p>'],
    ['Relationships', '<p>Tables link to each other by keys. An order row stores the <code>user_id</code> of the user who placed it, so you can join them back together.</p>'],
    ['SQL vs NoSQL', '<p><b>SQL</b> databases (PostgreSQL, MySQL) use tables and a query language. <b>NoSQL</b> databases (MongoDB, Redis) store documents or key-value pairs and trade some structure for flexibility and speed.</p>'],
  ]],
  sql: ['SQL', 'Data', 'SQL is the language you use to talk to a relational database: ask for data, add it, change it, delete it.', [
    ['Querying', '<p><code>SELECT</code> reads rows. Pick columns, filter with <code>WHERE</code>, sort with <code>ORDER BY</code>.</p>' + code("SELECT name, email FROM users\nWHERE active = true\nORDER BY name;")],
    ['Changing data', '<p><code>INSERT</code> adds, <code>UPDATE</code> changes, <code>DELETE</code> removes. Always filter an update or delete, or you change every row.</p>' + code("INSERT INTO users (name, email) VALUES ('Ada', 'ada@example.com');\nUPDATE users SET active = false WHERE id = 7;")],
    ['Joins', '<p>A join pulls related rows from two tables together.</p>' + code('SELECT orders.id, users.name\nFROM orders\nJOIN users ON users.id = orders.user_id;')],
  ]],
  json: ['JSON', 'Data', 'JSON is a simple text format for data. It is how most web APIs send and receive information, and it is easy for both people and programs to read.', [
    ['The shape', '<p>JSON is objects (key-value pairs in braces), arrays (lists in brackets), strings, numbers, booleans, and null. That is the whole format.</p>' + code('{\n  "name": "Ada",\n  "age": 36,\n  "languages": ["Python", "JavaScript"],\n  "active": true\n}')],
    ['Using it', '<p>Every language can turn JSON text into its own objects and back. In JavaScript that is <code>JSON.parse</code> and <code>JSON.stringify</code>.</p>' + code("const user = JSON.parse(text);\nconst text = JSON.stringify(user);")],
    ['Rules', '<p>Keys must be in double quotes, no trailing commas, no comments. It is strict on purpose, so it parses the same everywhere.</p>'],
  ]],
  apis: ['APIs', 'Web', 'An API is how one program talks to another. A web API lets your code ask a server for data or tell it to do something, usually over HTTP with JSON.', [
    ['Endpoints', '<p>An API exposes URLs called endpoints, each for a particular thing. You send a request to one and get a response back.</p>' + code('GET  /api/users        list users\nGET  /api/users/7      one user\nPOST /api/users        create a user')],
    ['Requests and responses', '<p>You send a method, a path, maybe headers and a JSON body. You get back a status code and usually JSON.</p>' + code("const res = await fetch('/api/users/7');\nconst user = await res.json();")],
    ['Authentication', '<p>Most APIs need to know who you are. You send a key or token, often in an <code>Authorization</code> header, so the server can check you are allowed.</p>'],
  ]],
  cookies: ['Cookies', 'Web', 'A cookie is a small piece of data a website stores in your browser and gets back on every later request. It is how a site remembers you between pages.', [
    ['Why they exist', '<p>HTTP forgets you after every request. A cookie is how a site keeps you logged in: the server sets one, and the browser sends it back each time, so the site knows it is still you.</p>'],
    ['Setting one', '<p>The server sends a <code>Set-Cookie</code> header; the browser returns it in a <code>Cookie</code> header on later requests.</p>' + code('Set-Cookie: session=abc123; Max-Age=86400; Secure; HttpOnly; SameSite=Lax')],
    ['Flags', '<p><code>Secure</code> sends it only over HTTPS, <code>HttpOnly</code> hides it from JavaScript, and <code>SameSite</code> controls whether it is sent on requests from other sites. They matter for security.</p>'],
  ]],
  caching: ['Caching', 'Web', 'Caching means keeping a copy of something close by so you do not have to fetch it again. It is one of the biggest reasons the web feels fast.', [
    ['Where it happens', '<p>Caches sit at every layer: your browser, a CDN near you, the server itself. The best request is the one that never has to travel because a cache answered it.</p>'],
    ['How the browser knows', '<p>Responses carry headers that say how long a copy is good for. <code>Cache-Control: max-age=3600</code> means "keep this an hour".</p>' + code('Cache-Control: public, max-age=3600')],
    ['Revalidation', '<p>When a cached copy expires, the browser can ask "has this changed?" with an <code>ETag</code>. If not, the server replies 304 Not Modified and sends no body, saving the download.</p>'],
  ]],
  ssh: ['SSH', 'Tools', 'SSH is how you log into another machine securely over the network and run commands on it as if you were sitting there. It is the standard way to manage servers.', [
    ['Connecting', '<p>Give it a user and a host. The first time, it asks you to trust the server\'s fingerprint.</p>' + code('ssh ada@server.example.com')],
    ['Keys', '<p>Instead of a password, use a key pair: a private key you keep and a public key you put on the server. More secure and no typing.</p>' + code('ssh-keygen -t ed25519\nssh-copy-id ada@server.example.com')],
    ['Copying files', '<p><code>scp</code> and <code>rsync</code> move files over the same secure connection.</p>' + code('scp report.pdf ada@server.example.com:/home/ada/')],
  ]],
  security: ['Web Security', 'Web', 'Web security is about keeping your site and its users safe from attackers. A few ideas prevent most common problems.', [
    ['Never trust input', '<p>Anything that comes from a user, a form, a URL, a header, could be hostile. Validate it, and escape it before you put it in a page or a database query.</p>'],
    ['Common attacks', '<p><b>XSS</b> injects scripts into your pages; escape output to stop it. <b>SQL injection</b> smuggles commands into queries; use parameterized queries. <b>CSRF</b> tricks a logged-in user into acting; use SameSite cookies and tokens.</p>' + code('-- never do this:\n"SELECT * FROM users WHERE name = \'" + input + "\'"\n-- do this:\n"SELECT * FROM users WHERE name = ?", [input]')],
    ['Use HTTPS', '<p>Serve everything over TLS, set the security headers, and keep your software updated. Most breaches come from skipping the basics.</p>'],
  ]],
};

const nav = `<nav>\n  <a href="/">About</a>\n  <a href="/">Schools</a>\n  <a href="/">Catalogue</a>\n  <a href="/">Calendar</a>\n</nav>`;
// The cover page's look: EB Garamond and Pinyon Script, green, brass and cream.
const FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com">\n  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n  <link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;1,400&family=Pinyon+Script&family=Inter:wght@300;400;500&display=swap" rel="stylesheet">';
const STYLE = `
  :root { --green: #1f3329; --brass: #a07a36; --cream: #f5f3ee; --paper: #e9e6dc; --ink: #1b1f1c; --soft: #6a6e68; --line: rgba(31,51,41,.16); }
  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body { margin: 0; background: var(--cream); color: var(--ink); font-family: 'Inter', sans-serif; font-weight: 300; font-size: 16px; line-height: 1.7; -webkit-font-smoothing: antialiased; }
  a { color: inherit; text-decoration: none; }
  header { border-bottom: 1px solid var(--line); padding: 18px 5vw; }
  .header-inner { max-width: 1100px; margin: auto; display: flex; align-items: center; justify-content: space-between; gap: 20px; }
  .logo { font-family: 'Pinyon Script', cursive; font-size: 32px; color: var(--green); line-height: 1; }
  .logo small { font-family: 'Inter', sans-serif; font-size: 10px; letter-spacing: .22em; text-transform: uppercase; color: var(--soft); margin-left: 10px; vertical-align: middle; }
  nav { display: flex; gap: 26px; font-size: 13px; color: var(--green); }
  nav a:hover { color: var(--brass); }
  main { max-width: 760px; margin: auto; padding: 56px 5vw 90px; }
  .crumb { font-size: 12px; color: var(--soft); margin-bottom: 22px; }
  .crumb a:hover { color: var(--green); }
  .label { display: block; margin-bottom: 10px; color: var(--brass); font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: .26em; }
  h1 { margin: 0 0 16px; font-family: 'EB Garamond', serif; font-weight: 400; font-size: clamp(36px, 5vw, 54px); line-height: 1.08; color: var(--green); }
  .lead { margin: 0 0 42px; color: var(--soft); font-size: 18px; }
  h2 { margin: 44px 0 12px; font-family: 'EB Garamond', serif; font-weight: 500; font-size: 28px; line-height: 1.2; color: var(--green); }
  p { margin: 0 0 14px; }
  b { font-weight: 500; }
  code { background: var(--paper); padding: 1px 5px; border-radius: 3px; font-size: 88%; }
  pre { background: var(--green); color: #e7e2d4; padding: 16px 18px; overflow: auto; }
  pre code { background: none; padding: 0; color: inherit; font-size: 13px; line-height: 1.55; }
  .more { margin-top: 56px; padding-top: 22px; border-top: 1px solid var(--line); font-size: 14px; }
  .more b { color: var(--green); }
  .more a { color: var(--brass); font-weight: 500; }
  .more a:hover { text-decoration: underline; }
  footer { background: var(--ink); color: #bfc8c1; padding: 30px 5vw; font-size: 13px; }
  .footer-inner { max-width: 1100px; margin: auto; display: flex; justify-content: space-between; gap: 10px; }
  .footer-inner em { font-family: 'EB Garamond', serif; font-size: 16px; color: #d4b679; }
  @media (max-width: 700px) { nav { display: none; } .footer-inner { flex-direction: column; } }`;

const slugs = Object.keys(T);
function page(slug) {
  const [title, cat, lead, sections] = T[slug];
  const others = slugs.filter((s) => s !== slug).sort(() => 0.5 - Math.random()).slice(0, 3);
  const body = sections.map(([h, html]) => `  <h2>${h}</h2>\n  ${html}`).join('\n\n');
  const more = others.map((s) => `<a href="/study/${s}.html">${T[s][0]}</a>`).join(' &nbsp;·&nbsp; ');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title.replace(/&amp;/g, '&')} - Applied Computing notes - Ashcobe Academy</title>
  ${FONTS}
  <meta name="description" content="${title.replace(/&amp;/g, '&')}: ${lead.slice(0, 120)}">
  <link rel="canonical" href="${SITE}/study/${slug}.html">
  <style>${STYLE}
  </style>
</head>
<body>
<header>
  <div class="header-inner">
    <a href="/" class="logo">Ashcobe<small>Academy · est. 2009</small></a>
    ${nav}
  </div>
</header>
<main>
  <div class="crumb"><a href="/">Home</a> › Applied Computing › ${cat} › ${title}</div>
  <span class="label">${cat}</span>
  <h1>${title}</h1>
  <p class="lead">${lead}</p>

${body}

  <div class="more"><b>Keep reading:</b> ${more}</div>
</main>
<footer>
  <div class="footer-inner"><div>© 2009–2026 Ashcobe Academy · School of Applied Computing</div><div><em>Scientia in usu</em></div></div>
</footer>
</body>
</html>
`;
}

for (const slug of slugs) fs.writeFileSync(path.join(HERE, `${slug}.html`), page(slug));

// robots.txt: allow everything, every crawler.
fs.writeFileSync(path.join(ROOT, 'robots.txt'), `# Ashcobe Academy: all crawlers welcome, everything allowed.\nUser-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);

// sitemap: the front page and every tutorial.
const today = new Date().toISOString().slice(0, 10);
const urls = ['/', ...slugs.map((s) => `/study/${s}.html`)]
  .map((u) => `  <url><loc>${SITE}${u}</loc><lastmod>${today}</lastmod></url>`).join('\n');
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);

console.log(`study: wrote ${slugs.length} tutorial pages, robots.txt, sitemap.xml`);
