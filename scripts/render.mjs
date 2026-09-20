// Rebuilds the generated parts of the profile README: the projects table, the
// theorem of the day and the contribution walk. Run by .github/workflows/refresh.yml
// once a day, and by hand with `node scripts/render.mjs`.
//
// Everything editorial lives in projects.json and theorems.json. This file only
// decides how it is drawn.
import { readFileSync, writeFileSync } from "node:fs";

const USER = "firekern";
const TOKEN = process.env.GITHUB_TOKEN;
const today = new Date();
const stamp = today.toISOString().slice(0, 10).replace(/-/g, "");

const read = name => JSON.parse(readFileSync(new URL("../" + name, import.meta.url), "utf8"));
const write = (name, body) => writeFileSync(new URL("../" + name, import.meta.url), body);
const escape = text => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function github(path, body) {
	const response = await fetch("https://api.github.com" + path, {
		method: body ? "POST" : "GET",
		headers: {
			accept: "application/vnd.github+json",
			"user-agent": USER + "-profile",
			...(TOKEN ? { authorization: "Bearer " + TOKEN } : {}),
		},
		body: body && JSON.stringify(body),
	});
	if (!response.ok) {
		throw new Error(`GitHub ${path} returned ${response.status}: ${(await response.text()).slice(0, 200)}`);
	}
	return response.json();
}

// ---------------------------------------------------------------- projects

function shield(label, spec) {
	const [color, text, logo] = spec.split(":");
	const name = encodeURIComponent(label).replace(/-/g, "--");
	const logoPart = logo ? `&logo=${logo}&logoColor=${text}` : "";
	return `<img src="https://img.shields.io/badge/${name}-${color}?style=flat-square${logoPart}&labelColor=1c1c22" alt="${label}">`;
}

function starShield(repo) {
	return `<img src="https://img.shields.io/github/stars/${USER}/${repo}?style=flat-square&color=E5397F&labelColor=1c1c22" alt="stars">`;
}

async function projectsTable() {
	const { projects, badgeColors } = read("projects.json");
	const cells = await Promise.all(projects.map(async project => {
		const repo = await github(`/repos/${USER}/${project.repo}`);
		const badges = project.badges
			.map(badge => (badge === "stars" ? starShield(project.repo) : shield(badge, badgeColors[badge])))
			.join(" ");
		// The star count only earns a badge once a project has stars to show.
		const stars = repo.stargazers_count > 0 && !project.badges.includes("stars")
			? " " + starShield(project.repo)
			: "";
		return [
			'<td width="50%" valign="top">',
			"",
			`**[${project.title}](${repo.html_url})**`,
			"",
			escape(project.blurb),
			"",
			badges + stars,
			"",
			"</td>",
		].join("\n");
	}));

	const rows = [];
	for (let i = 0; i < cells.length; i += 2) {
		rows.push("<tr>\n" + cells.slice(i, i + 2).join("\n") + "\n</tr>");
	}
	return '<table align="center">\n' + rows.join("\n") + "\n</table>";
}

// ------------------------------------------------------------ theorem card

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

function theoremCard() {
	const { theorems } = read("theorems.json");
	const dayOfYear = Math.floor((today - new Date(today.getFullYear(), 0, 0)) / 86400000);
	const theorem = theorems[dayOfYear % theorems.length];
	const number = `${today.getMonth() + 1}.${today.getDate()}`;

	const statement = wrap(theorem.statement, 62);
	const proof = wrap("Proof. " + theorem.proof, 62);
	const lines = [
		{ text: `${theorem.kind} ${number} (Porcelli, ${today.getFullYear()}).`, fill: "#E5397F", weight: "600", style: "normal" },
		...statement.map(text => ({ text, fill: "#d7d7de", weight: "400", style: "normal" })),
		{ text: "", fill: "#d7d7de", weight: "400", style: "normal" },
		...proof.map((text, i) => ({
			text: i === proof.length - 1 ? text + "  ∎" : text,
			fill: "#8b8b96", weight: "400", style: "italic",
		})),
	];

	const pad = 26;
	const lineHeight = 23;
	const width = 720;
	const height = pad * 2 + lines.length * lineHeight + 8;
	// Each line is revealed by its own mask, so the card types itself out top to
	// bottom instead of fading in as a block.
	const perLine = 0.55;
	const body = lines.map((line, i) => {
		const y = pad + 20 + i * lineHeight;
		const id = "type" + i;
		return `
	<mask id="${id}"><rect x="${pad}" y="${y - 17}" width="0" height="${lineHeight}" fill="#fff">
		<animate attributeName="width" from="0" to="${width - pad * 2}" begin="${(i * perLine).toFixed(2)}s" dur="${perLine.toFixed(2)}s" fill="freeze"/>
	</rect></mask>
	<text x="${pad}" y="${y}" mask="url(#${id})" fill="${line.fill}" font-weight="${line.weight}" font-style="${line.style}" font-size="16.5" font-family="ui-serif, Georgia, 'Times New Roman', serif">${escape(line.text)}</text>`;
	}).join("");

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(theorem.kind + " " + number + ". " + theorem.statement)}">
	<rect width="${width}" height="${height}" rx="14" fill="#1c1c22"/>
	<rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="13.5" fill="none" stroke="#E5397F" stroke-opacity="0.35"/>
	<rect x="0" y="0" width="4" height="${height}" rx="2" fill="#E5397F"/>${body}
</svg>
`;
}

// ------------------------------------------------------- contribution walk

async function contributionWalk() {
	const query = `query($user:String!){user(login:$user){contributionsCollection{contributionCalendar{weeks{contributionDays{contributionCount weekday}}}}}}`;
	const result = await github("/graphql", { query, variables: { user: USER } });
	if (result.errors) throw new Error("GraphQL: " + JSON.stringify(result.errors).slice(0, 300));
	const weeks = result.data.user.contributionsCollection.contributionCalendar.weeks;

	const cell = 11, gap = 3, step = cell + gap;
	const padX = 24, padY = 58;
	const width = padX * 2 + weeks.length * step - gap;
	const height = padY + 7 * step - gap + 30;
	const busiest = Math.max(1, ...weeks.flatMap(w => w.contributionDays.map(d => d.contributionCount)));
	const shades = ["#26262e", "#5c2340", "#93305a", "#c33d73", "#E5397F"];
	const level = count => (count === 0 ? 0 : Math.min(4, 1 + Math.floor((count / busiest) * 3.99)));

	// One cycle: the cat crosses the whole grid, clearing each column as it reaches it.
	const cycle = 20;
	const squares = [];
	const keyframes = [];
	weeks.forEach((week, w) => {
		const eaten = ((w + 1) / weeks.length) * 88;
		keyframes.push(`@keyframes eat${w}{0%,${eaten.toFixed(2)}%{opacity:1;transform:scale(1)}${(eaten + 1.6).toFixed(2)}%,95%{opacity:.14;transform:scale(.5)}100%{opacity:1;transform:scale(1)}}`);
		for (const day of week.contributionDays) {
			squares.push(`<rect class="c w${w}" x="${padX + w * step}" y="${padY + day.weekday * step}" width="${cell}" height="${cell}" rx="2.5" fill="${shades[level(day.contributionCount)]}"/>`);
		}
	});

	const catSize = 46;
	const travel = width + catSize;
	const cat = `<path d="M15 31v-17l9 8a19 19 0 0 1 16 0l9-8v17c0 10-7.6 16-17 16s-17-6-17-16z" fill="#E5397F" fill-opacity="0.22" stroke="none"/><path d="M15 31v-17l9 8a19 19 0 0 1 16 0l9-8v17c0 10-7.6 16-17 16s-17-6-17-16z"/><circle cx="25" cy="32" r="5"/><circle cx="39" cy="32" r="5"/><path d="M30 31.5h4"/><path d="M23 33q2-2 4 0M37 33q2-2 4 0"/><path d="M29 40q1.5 2 3 0q1.5 2 3 0"/><path d="M18 38.5h3M43 38.5h3"/><path d="M11 52q10.5-4.5 21 0q10.5-4.5 21 0v8q-10.5-4.5-21 0q-10.5-4.5-21 0z" fill="#E5397F" fill-opacity="0.22" stroke="none"/><path d="M11 52q10.5-4.5 21 0q10.5-4.5 21 0v8q-10.5-4.5-21 0q-10.5-4.5-21 0z"/><path d="M32 52v8"/><path d="M55 4.5l1.2 3.8 3.8 1.2-3.8 1.2-1.2 3.8-1.2-3.8-3.8-1.2 3.8-1.2z" fill="#E5397F" stroke="none"/>`;

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="A year of contributions, with the Zusia cat walking across the grid and clearing each week as it passes">
	<style>
		.c{transform-box:fill-box;transform-origin:center;animation-duration:${cycle}s;animation-timing-function:linear;animation-iteration-count:infinite}
		${weeks.map((_, w) => `.w${w}{animation-name:eat${w}}`).join("")}
		${keyframes.join("")}
		.cat{animation:walk ${cycle}s linear infinite}
		@keyframes walk{from{transform:translate(${-catSize}px,0)}to{transform:translate(${travel}px,0)}}
		.paw{animation:bob ${(cycle / 26).toFixed(3)}s ease-in-out infinite alternate}
		@keyframes bob{from{transform:translateY(0)}to{transform:translateY(-3px)}}
	</style>
	<rect width="${width}" height="${height}" rx="14" fill="#1c1c22"/>
	<text x="${padX}" y="30" fill="#8b8b96" font-size="13" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">a year of commits, and something that eats them</text>
	${squares.join("\n\t")}
	<g class="cat"><g class="paw"><g transform="translate(0 ${padY + 7 * step - gap - catSize + 4}) scale(${(catSize / 64).toFixed(4)})" fill="none" stroke="#E5397F" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${cat}</g></g></g>
</svg>
`;
}

// ------------------------------------------------------------------- README

function replaceBlock(text, name, body) {
	const start = `<!-- ${name}:start -->`;
	const end = `<!-- ${name}:end -->`;
	const from = text.indexOf(start);
	const to = text.indexOf(end);
	if (from === -1 || to === -1) throw new Error(`README is missing the ${name} markers`);
	return text.slice(0, from + start.length) + "\n" + body + "\n" + text.slice(to);
}

const [table, walk] = await Promise.all([projectsTable(), contributionWalk()]);
write("assets/theorem.svg", theoremCard());
write("assets/contribution-walk.svg", walk);

let readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
readme = replaceBlock(readme, "projects", table);
// Bust GitHub's image cache so the day's theorem is the one people see.
readme = readme.replace(/(assets\/(?:theorem|contribution-walk)\.svg)(\?d=\d+)?/g, `$1?d=${stamp}`);
write("README.md", readme);
console.log("rendered: projects table, theorem card, contribution walk");
