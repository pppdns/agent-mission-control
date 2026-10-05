See project description in [project-description.md](project-description.md)

## Agent instructions

### Git

When a task changes files in this repository, commit those changes and push them to the remote before you finish. Do this every time, without waiting to be asked. Leave secrets and local env files untracked (`.env*` stays ignored; `.env.example` may be committed).

### Public repository

This repository is public on GitHub. Do not commit secrets or other sensitive data to the tree, docs, fixtures, or git history. That includes API keys, tokens, passwords, connection strings, and anything from `.env.local`. Keep those in local env files or the host's environment settings.

### Rate limits when testing

Starting runs is limited per IP (1 active, 3 per hour, 10 per day). When you test run creation in a browser, locally or on the deployed site, skip those limits by setting an `amc-operator` cookie whose value is `OPERATOR_TOKEN` from `.env.local`, for example by evaluating this in the page:

```js
document.cookie = "amc-operator=<OPERATOR_TOKEN>; Path=/; Max-Age=2592000; SameSite=Lax; Secure" // drop "; Secure" on http://localhost
```

Read the token from `.env.local` at the time you need it. Never write its value into files, commits, or chat output. Moderation, BotID, and the global daily spend cap still apply, so keep test runs few and short.
