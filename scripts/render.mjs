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

const PINK = "#E5397F";
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
	<rect x="1" y="1" width="${CARD_W - 2}" height="${CARD_H - 2}" rx="20" fill="#1c1c22" stroke="${PINK}" stroke-opacity="0.3"/>
	<circle cx="34" cy="40" r="6" fill="${PINK}"/>
	<text x="52" y="46" fill="${PINK}" font-size="18" font-weight="600" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">${escape(project.title)}</text>
	${body}
	<text x="26" y="${CARD_H - 22}" fill="#6f6f7c" font-size="12.5" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">${escape(facts)}</text>
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
	cells.push(`<td width="50%" align="center"><a href="${repo.html_url}"><img src="${file}?d=${stamp}" alt="${escape(project.title)}: ${escape(project.blurb)}" width="100%"></a></td>`);
}

const rows = [];
for (let i = 0; i < cells.length; i += 2) {
	rows.push("<tr>\n\t" + cells.slice(i, i + 2).join("\n\t") + "\n</tr>");
}
const table = '<table align="center" width="100%">\n' + rows.join("\n") + "\n</table>";

let readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
write("README.md", replaceBlock(readme, "projects", table));
console.log(`rendered ${projects.length} project cards`);
