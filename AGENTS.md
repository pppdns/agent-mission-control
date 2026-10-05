See project description in [project-description.md](project-description.md)

## Agent instructions

### Git

When a task changes files in this repository, commit those changes and push them to the remote before you finish. Do this every time, without waiting to be asked. Leave secrets and local env files untracked (`.env*` stays ignored; `.env.example` may be committed).

### Public repository

This repository is public on GitHub. Do not commit secrets or other sensitive data to the tree, docs, fixtures, or git history. That includes API keys, tokens, passwords, connection strings, and anything from `.env.local`. Keep those in local env files or the host's environment settings.
