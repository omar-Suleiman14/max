#!/usr/bin/env node
/**
 * Create the `Max 2.0` GitHub Project, its fields, and every field value.
 *
 * The milestones, the release parent issues, the implementation issues, the
 * sub-issue links and the blocked-by dependencies already exist in GitHub. Only
 * the Project needed a token scope that the setup session did not have, so this
 * script finishes that one part.
 *
 * Run it once:
 *
 *   gh auth refresh -s project
 *   node scripts/bootstrap-max-2.0-project.mjs
 *
 * It is idempotent. Running it again adds whatever is missing and leaves the
 * rest alone, so it is also the way to add issues created later.
 *
 * Field values are read from each issue's labels, so the labels stay the single
 * source of truth and the two cannot drift apart.
 */

import { execFileSync } from 'node:child_process';
import console from 'node:console';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const OWNER = 'omar-Suleiman14';
const REPO = 'max';
const TITLE = 'Max 2.0';

/** Project single-select fields, and the label prefix each one reads. */
const FIELDS = [
  { name: 'Priority', prefix: '', options: ['P0', 'P1', 'P2', 'P3'] },
  { name: 'Area', prefix: 'area:', options: ['Desktop', 'Database', 'Editor', 'Workflows', 'Backup', 'Publish', 'Sync', 'Mobile', 'Integrations', 'Cloud', 'Distribution', 'Release', 'Docs'] },
  { name: 'Type', prefix: 'type:', options: ['Feature', 'Improvement', 'Bug', 'Refactor', 'Performance', 'Security', 'Documentation', 'Test', 'Legal', 'Design'] },
  { name: 'Size', prefix: 'size:', options: ['S', 'M', 'L', 'XL'] },
  { name: 'Platform', prefix: 'platform:', options: ['Shared', 'Desktop', 'macOS', 'Windows', 'Linux', 'Mobile', 'iOS', 'Android', 'Web', 'Server', 'Infrastructure'] },
  { name: 'Implementation model', prefix: 'model:', options: ['Opus', 'Terra'] },
];

/** Status is a built-in field; its options are replaced rather than created. */
const STATUS_OPTIONS = ['Backlog', 'Ready', 'In progress', 'Blocked', 'Review', 'Done'];

/**
 * Views cannot be created through the public GraphQL API, so the script prints
 * these for the owner to add in the Project UI rather than pretending to.
 */
const VIEWS = [
  ['Roadmap', 'Group by Milestone.'],
  ['Board', 'Board layout, group by Status.'],
  ['2.0 blockers', 'Filter: Priority is P0 or P1, Status is not Done.'],
  ['Review queue', 'Filter: Status is Review.'],
  ['Mobile', 'Filter: Area is Mobile or Sync, or Platform is Mobile, iOS or Android.'],
  ['Cloud and sync', 'Filter: Area is Backup, Sync or Cloud, or Platform is Server.'],
  ['Distribution', 'Filter: Area is Distribution or Release, or Platform is macOS, Windows, Linux, iOS or Android.'],
  ['Integrations', 'Filter: Area is Integrations.'],
];

const gql = (query, variables = {}) => {
  const args = ['api', 'graphql', '-f', `query=${query}`];
  for (const [key, value] of Object.entries(variables)) args.push('-f', `${key}=${value}`);
  const out = execFileSync('gh', args, { encoding: 'utf-8', maxBuffer: 32 * 1024 * 1024 });
  const body = JSON.parse(out);
  if (body.errors) throw new Error(JSON.stringify(body.errors));
  return body.data;
};

const rest = (path) =>
  JSON.parse(execFileSync('gh', ['api', '--paginate', '--slurp', path], { encoding: 'utf-8', maxBuffer: 32 * 1024 * 1024 })).flat();

function findOrCreateProject(ownerId) {
  const existing = gql(`query($login:String!){user(login:$login){projectsV2(first:100){nodes{id number title url}}}}`, { login: OWNER })
    .user.projectsV2.nodes.find((p) => p.title === TITLE);
  if (existing) {
    console.log(`Project already exists: ${existing.url}`);
    return existing;
  }
  const created = gql(
    `mutation($ownerId:ID!,$title:String!){createProjectV2(input:{ownerId:$ownerId,title:$title}){projectV2{id number title url}}}`,
    { ownerId, title: TITLE },
  ).createProjectV2.projectV2;
  console.log(`Created project: ${created.url}`);
  return created;
}

function projectFields(projectId) {
  const nodes = gql(
    `query($id:ID!){node(id:$id){... on ProjectV2{fields(first:50){nodes{
      ... on ProjectV2Field{id name}
      ... on ProjectV2SingleSelectField{id name options{id name}}
    }}}}}`,
    { id: projectId },
  ).node.fields.nodes;
  return new Map(nodes.filter(Boolean).map((f) => [f.name, f]));
}

function ensureFields(projectId) {
  let fields = projectFields(projectId);

  const status = fields.get('Status');
  const statusNames = (status?.options ?? []).map((o) => o.name);
  if (status && (statusNames.length !== STATUS_OPTIONS.length || statusNames.some((n, i) => n !== STATUS_OPTIONS[i]))) {
    const options = STATUS_OPTIONS.map((n) => `{name:${JSON.stringify(n)},color:GRAY,description:""}`).join(',');
    gql(`mutation($f:ID!){updateProjectV2Field(input:{fieldId:$f,singleSelectOptions:[${options}]}){projectV2Field{... on ProjectV2SingleSelectField{id}}}}`, { f: status.id });
    console.log('Updated Status options.');
  }

  for (const field of FIELDS) {
    if (fields.has(field.name)) continue;
    const options = field.options.map((n) => `{name:${JSON.stringify(n)},color:GRAY,description:""}`).join(',');
    gql(
      `mutation($p:ID!,$n:String!){createProjectV2Field(input:{projectId:$p,dataType:SINGLE_SELECT,name:$n,singleSelectOptions:[${options}]}){projectV2Field{... on ProjectV2SingleSelectField{id}}}}`,
      { p: projectId, n: field.name },
    );
    console.log(`Created field: ${field.name}`);
  }
  return projectFields(projectId);
}

export function projectItems(projectId, query = gql) {
  const items = new Map();
  let cursor;
  do {
    const page = query(
      `query($id:ID!,$cursor:String){node(id:$id){... on ProjectV2{items(first:100,after:$cursor){
        nodes{id content{... on Issue{number repository{nameWithOwner}}}}
        pageInfo{hasNextPage endCursor}
      }}}}`,
      { id: projectId, ...(cursor ? { cursor } : {}) },
    ).node.items;
    for (const item of page.nodes) {
      if (item?.content?.repository?.nameWithOwner === `${OWNER}/${REPO}`) {
        items.set(item.content.number, item.id);
      }
    }
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : undefined;
    if (page.pageInfo.hasNextPage && !cursor) throw new Error('Project pagination returned no cursor.');
  } while (cursor);
  return items;
}

function main() {
  const ownerId = gql(`query($login:String!){user(login:$login){id}}`, { login: OWNER }).user.id;
  const project = findOrCreateProject(ownerId);
  const fields = ensureFields(project.id);

  // Every milestoned issue belongs in the Project: release parents and their
  // implementation sub-issues alike.
  const issues = rest(`repos/${OWNER}/${REPO}/issues?state=all&per_page=100`)
    .filter((i) => !i.pull_request && i.milestone);
  console.log(`Found ${issues.length} milestoned issues.`);

  let items = projectItems(project.id);
  for (const issue of issues) {
    if (!items.has(issue.number)) {
      gql(`mutation($p:ID!,$c:ID!){addProjectV2ItemById(input:{projectId:$p,contentId:$c}){item{id}}}`, { p: project.id, c: issue.node_id });
      console.log(`Added #${issue.number}`);
    }
  }
  items = projectItems(project.id);

  const setValue = (itemId, field, optionName) => {
    const option = field.options?.find((o) => o.name === optionName);
    if (!option) return false;
    gql(
      `mutation($p:ID!,$i:ID!,$f:ID!,$o:String!){updateProjectV2ItemFieldValue(input:{projectId:$p,itemId:$i,fieldId:$f,value:{singleSelectOptionId:$o}}){projectV2Item{id}}}`,
      { p: project.id, i: itemId, f: field.id, o: option.id },
    );
    return true;
  };

  let updated = 0;
  const unmatched = [];
  for (const issue of issues) {
    const itemId = items.get(issue.number);
    if (!itemId) { unmatched.push(issue.number); continue; }
    const labels = issue.labels.map((l) => l.name);

    const statusLabel = labels.find((l) => l.startsWith('status:'))?.slice('status:'.length) ?? 'Backlog';
    setValue(itemId, fields.get('Status'), statusLabel);

    for (const spec of FIELDS) {
      const field = fields.get(spec.name);
      // Platform is multi-valued on some issues; a single-select field takes the
      // most specific one, which is the last label the issue carries.
      const matches = labels.filter((l) => (spec.prefix ? l.startsWith(spec.prefix) : spec.options.includes(l)));
      const value = matches.at(-1)?.slice(spec.prefix.length);
      if (value) setValue(itemId, field, value);
    }
    updated += 1;
    if (updated % 20 === 0) console.log(`Populated ${updated}/${issues.length}…`);
  }

  console.log(`\nPopulated ${updated} items.`);
  if (unmatched.length) console.log(`Could not match items for issues: ${unmatched.join(', ')}`);

  console.log(`\nProject: ${project.url}`);
  console.log('\nViews cannot be created through the public GraphQL API. Add these in the Project UI:\n');
  for (const [name, description] of VIEWS) console.log(`  ${name.padEnd(16)} ${description}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
