# Optional Makefile ideas

The repo currently uses shell scripts instead of adding another build entrypoint.

Suggested aliases:

```makefile
research-core:
	./tools/research/install-research-tools.sh core

research-pdf:
	./tools/research/install-research-tools.sh pdf

research-health:
	./tools/research/check-tools.sh
```
