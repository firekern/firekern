// Redraws one rounded card per project into assets/, and rebuilds the table that
// links them in the README. Run by .github/workflows/refresh.yml, or by hand with
// `node scripts/render.mjs`.
//
// Editorial content lives in projects.json. This file only decides how it is drawn.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const USER = "firekern";
const TOKEN = process.env.GITHUB_TOKEN;
const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");

const read = name => JSON.parse(readFileSync(new URL("../" + name, import.meta.url), "utf8"));
const write = (name, body) => writeFileSync(new URL("../" + name, import.meta.url), body);
const escape = text => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function repoInfo(name) {
	const response = await fetch(`https://api.github.com/repos/${USER}/${name}`, {
		headers: {
			accept: "application/vnd.github+json",
			"user-agent": USER + "-profile",
			...(TOKEN ? { authorization: "Bearer " + TOKEN } : {}),
		},
	});
	if (!response.ok) {
		throw new Error(`GitHub /repos/${USER}/${name} returned ${response.status}: ${(await response.text()).slice(0, 200)}`);
	}
	return response.json();
}

function wrap(text, width) {
	const lines = [];
	let line = "";
	for (const word of text.split(" ")) {
		if (line && (line + " " + word).length > width) {
			lines.push(line);
			line = word;
		}
		else line = line ? line + " " + word : word;
	}
	if (line) lines.push(line);
	return lines;
}

const RED = "#d42a3c";
const CARD_W = 460;
const CARD_H = 168;

function card(project, repo) {
	// Three lines is what fits above the footer. A longer blurb is a content
	// problem, so it is cut here rather than allowed to run into the stats.
	const wrapped = wrap(project.blurb, 52);
	const blurb = wrapped.slice(0, 3);
	if (wrapped.length > 3) blurb[2] = blurb[2].replace(/[ ,.;]*$/, "") + "\u2026";
	const body = blurb.map((line, i) =>
		`<text x="26" y="${82 + i * 20}" fill="#a8a8b4" font-size="13.5" font-family="ui-sans-serif, -apple-system, Segoe UI, Roboto, sans-serif">${escape(line)}</text>`
	).join("\n\t");

	const facts = [project.language || repo.language, repo.stargazers_count > 0 ? `★ ${repo.stargazers_count}` : null]
		.filter(Boolean)
		.join("   ·   ");

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}" role="img" aria-label="${escape(project.title + ". " + project.blurb)}">
	<rect x="1" y="1" width="${CARD_W - 2}" height="${CARD_H - 2}" rx="20" fill="#111111" stroke="${RED}" stroke-opacity="0.3"/>
	<circle cx="34" cy="40" r="6" fill="${RED}"/>
	<text x="52" y="46" fill="${RED}" font-size="18" font-weight="600" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">${escape(project.title)}</text>
	${body}
	<text x="26" y="${CARD_H - 22}" fill="#6f6f7c" font-size="12.5" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">${escape(facts)}</text>
</svg>
`;
}

// ------------------------------------------------------------ terminal card

// The lines the terminal types, in order. A `prompt` line is shown after a red
// $; anything else is output. An empty string is a blank line.
const SESSION = [
	{ prompt: "whoami" },
	{ out: "research assistant, University of Foggia" },
	{ out: "" },
	{ prompt: "cat interests.txt" },
	{ out: "cybersecurity" },
	{ out: "large language models" },
	{ out: "a bit of everything else" },
];

function terminalCard() {
	const width = 760;
	const bar = 42;
	const lineHeight = 24;
	const padX = 26;
	const height = bar + 22 + SESSION.length * lineHeight + 34;
	const cycle = SESSION.length * 1.6 + 5;
	const inner = width - padX * 2;

	// Each line gets its own slice of one shared cycle. The animation runs on the
	// mask rect's width: CSS, not SMIL, because SMIL's repeatCount does not
	// advance once the SVG is embedded with <img>, which is how a README shows it.
	const slice = 0.76 / SESSION.length;
	const keyframes = [];
	const body = SESSION.map((line, i) => {
		if (!line.prompt && line.out === "") return "";
		const y = bar + 40 + i * lineHeight;
		const from = Math.max(0.2, i * slice * 100);
		const to = from + slice * 88;
		keyframes.push(`@keyframes type${i}{0%,${from.toFixed(2)}%{width:0}${to.toFixed(2)}%,96%{width:${inner}px}100%{width:0}}`);
		const text = line.prompt
			? `<tspan fill="${RED}">$</tspan> <tspan fill="#e6e6ea">${escape(line.prompt)}</tspan>`
			: `<tspan fill="#9a9aa4">${escape(line.out)}</tspan>`;
		return `
	<mask id="line${i}"><rect class="t t${i}" x="${padX}" y="${y - 16}" width="0" height="${lineHeight}" fill="#fff"/></mask>
	<text x="${padX}" y="${y}" mask="url(#line${i})" font-size="15" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">${text}</text>`;
	}).join("");

	const cursorY = bar + 40 + SESSION.length * lineHeight;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="A terminal that types: whoami, research assistant at the University of Foggia; cat interests.txt, cybersecurity, large language models, a bit of everything else">
	<style>
		.t{animation-duration:${cycle.toFixed(2)}s;animation-timing-function:steps(28,end);animation-iteration-count:infinite}
		${SESSION.map((l, i) => (!l.prompt && l.out === "") ? "" : `.t${i}{animation-name:type${i}}`).join("")}
		${keyframes.join("")}
		.cursor{animation:blink 1.1s steps(1,end) infinite}
		@keyframes blink{0%,49%{opacity:1}50%,99%{opacity:0}100%{opacity:1}}
	</style>
	<rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="14" fill="#111111" stroke="${RED}" stroke-opacity="0.35"/>
	<path d="M1 15a14 14 0 0 1 14-14h${width - 30}a14 14 0 0 1 14 14v${bar - 15}H1z" fill="${RED}" fill-opacity="0.1"/>
	<circle cx="26" cy="${bar / 2}" r="5" fill="${RED}"/>
	<circle cx="46" cy="${bar / 2}" r="5" fill="${RED}" fill-opacity="0.55"/>
	<circle cx="66" cy="${bar / 2}" r="5" fill="${RED}" fill-opacity="0.28"/>
	<text x="${width / 2}" y="${bar / 2 + 5}" text-anchor="middle" fill="#7a7a86" font-size="13" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">andrea@foggia</text>${body}
	<text x="${padX}" y="${cursorY}" font-size="15" font-family="ui-monospace, SFMono-Regular, Menlo, monospace"><tspan fill="${RED}">$</tspan> <tspan class="cursor" fill="#e6e6ea">_</tspan></text>
</svg>
`;
}

function replaceBlock(text, name, body) {
	const start = `<!-- ${name}:start -->`;
	const end = `<!-- ${name}:end -->`;
	const from = text.indexOf(start);
	const to = text.indexOf(end);
	if (from === -1 || to === -1) throw new Error(`README is missing the ${name} markers`);
	return text.slice(0, from + start.length) + "\n" + body + "\n" + text.slice(to);
}

mkdirSync(new URL("../assets/", import.meta.url), { recursive: true });
const { projects } = read("projects.json");
const cells = [];
for (const project of projects) {
	const repo = await repoInfo(project.repo);
	const file = `assets/card-${project.repo}.svg`;
	write(file, card(project, repo));
	cells.push(`<a href="${repo.html_url}"><img src="${file}?d=${stamp}" alt="${escape(project.title)}: ${escape(project.blurb)}" width="49%"></a>`);
}

// Two per paragraph, so they sit two to a row without a table around them.
const rows = [];
for (let i = 0; i < cells.length; i += 2) {
	rows.push('<p align="center">\n\t' + cells.slice(i, i + 2).join("\n\t") + "\n</p>");
}
const table = rows.join("\n");

let readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
write("README.md", replaceBlock(readme, "projects", table));
write("assets/terminal.svg", terminalCard());
console.log(`rendered ${projects.length} project cards and the terminal`);
