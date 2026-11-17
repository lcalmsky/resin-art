// Find and fetch CC0 photogrammetry scans (Smithsonian Open Access, repackaged as
// web-ready GLB by codepawl/smithsonian-3d-glb on Hugging Face) for use with
// lib/assets.ts `scan()`.
//
//   node scripts/scans.ts search <word> [word...]   list matching scans (e.g. shell, scallop, coral, conus)
//   node scripts/scans.ts fetch <slug> [slug...] [--tier lod2|lod1|full]   download into assets/scans/ with a credit line
//
// Slugs are the folder names that `search` prints. Files are meshopt geometry with
// WebP textures. The default tier, lod2, keeps 20% of the triangles (about 30k,
// 0.1–0.5 MB): plenty for a shell a few centimetres across, and it keeps exported
// GLB/USDZ files small. lod1 keeps 50%, full is the original scan.
import { mkdirSync, writeFileSync, existsSync, readFileSync, appendFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO = 'codepawl/smithsonian-3d-glb';
const root = resolve(import.meta.dirname, '..');
const dir = join(root, 'assets', 'scans');
const argv = process.argv.slice(2);
const tierAt = argv.indexOf('--tier');
const tier = tierAt >= 0 ? argv.splice(tierAt, 2)[1] : 'lod2';
if (!['lod1', 'lod2', 'full'].includes(tier)) { console.error(`--tier must be lod2, lod1 or full, got ${tier}`); process.exit(1); }
const [cmd, ...words] = argv;
const remote = (slug: string) => tier === 'full' ? `objects/${slug}/${slug}.glb` : `lods/${slug}/${slug}_${tier}.glb`;

async function list(): Promise<string[]> {
  const names: string[] = [];
  let url: string | null = `https://huggingface.co/api/datasets/${REPO}/tree/main/objects`;
  while (url) {
    const r: Response = await fetch(url);
    if (!r.ok) throw new Error(`Hugging Face listing failed: HTTP ${r.status}`);
    names.push(...((await r.json()) as { path: string }[]).map((x) => x.path.split('/').pop()!));
    url = r.headers.get('link')?.match(/<([^>]+)>;\s*rel="next"/)?.[1] ?? null;
  }
  return names;
}

if (cmd === 'search' && words.length) {
  const re = new RegExp(words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i');
  const hits = (await list()).filter((n) => re.test(n));
  console.log(hits.length ? hits.join('\n') : `no scan matches ${words.join(', ')} (try the genus name, e.g. conus, cypraea, pecten, acropora)`);
} else if (cmd === 'fetch' && words.length) {
  mkdirSync(dir, { recursive: true });
  const credits = join(dir, 'CREDITS.md');
  if (!existsSync(credits)) writeFileSync(credits, '# Scan credits\n\nAll scans: Smithsonian Institution, Smithsonian Open Access (https://www.si.edu/openaccess, https://3d.si.edu), CC0 1.0. Web GLB packaging by codepawl/smithsonian-3d-glb (Hugging Face). Not endorsed by the Smithsonian.\n\n');
  for (const slug of words) {
    if (!/^[a-z0-9][a-z0-9-]*$/i.test(slug)) { console.error(`${slug}: not a scan slug (letters, digits and hyphens, as \`search\` prints them)`); process.exitCode = 1; continue; }
    const r = await fetch(`https://huggingface.co/datasets/${REPO}/resolve/main/${remote(slug)}`);
    if (!r.ok) { console.error(`${slug}: HTTP ${r.status}`); process.exitCode = 1; continue; }
    const file = join(dir, `${slug}.glb`);
    writeFileSync(file, Buffer.from(await r.arrayBuffer()));
    if (!readFileSync(credits, 'utf8').includes(slug)) appendFileSync(credits, `- \`${slug}.glb\` (${tier}): https://huggingface.co/datasets/${REPO}/tree/main/${remote(slug).replace(/\/[^/]+$/, '')}\n`);
    console.log(`assets/scans/${slug}.glb`);
  }
} else {
  console.error('usage: scans.ts search <word...> | fetch <slug...> [--tier lod2|lod1|full]');
  process.exitCode = 1;
}
