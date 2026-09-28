.PHONY: codegen-setup start-docker start-backend codegen env-sync docker-build-frontend docker-build-pdf-frontend docker-build-backend docker-build-ai-service

dc = docker compose

codegen-setup: start-docker start-backend codegen

start-docker:
	cd apps/backend && docker compose up -d

start-backend:
	cd apps/backend && pnpm install && pnpm run dev &
	sleep 5

codegen:
	cd apps/shared/types && pnpm codegen

# Copy .env files from the primary git worktree into the current worktree.
# Skips files that already exist with different content (use FORCE=1 to overwrite).
env-sync:
	@root=$$(git worktree list --porcelain | awk '/^worktree / { print $$2; exit }'); \
	cwd=$$(pwd); \
	if [ "$$root" = "$$cwd" ]; then \
	  echo "Already in the primary worktree ($$root); nothing to sync."; \
	  exit 0; \
	fi; \
	echo "Syncing .env files: $$root → $$cwd"; \
	count=0; \
	find "$$root" -type f -name '.env' \
	  -not -path '*/node_modules/*' \
	  -not -path '*/.agents/*' \
	  -not -path '*/.worktrees/*' \
	  -not -path '*/dist/*' \
	  -print0 | while IFS= read -r -d '' src; do \
	    rel=$${src#$$root/}; \
	    dest="$$cwd/$$rel"; \
	    if [ -e "$$dest" ] && cmp -s "$$src" "$$dest"; then \
	      echo "  = $$rel (identical, skipped)"; \
	    elif [ -e "$$dest" ] && [ "$$FORCE" != "1" ]; then \
	      echo "  ! $$rel (differs, skipped — run with FORCE=1 to overwrite)"; \
	    else \
	      mkdir -p "$$(dirname "$$dest")"; \
	      cp "$$src" "$$dest" && echo "  + $$rel"; \
	    fi; \
	  done

docker-build-frontend:
	docker build . --target frontend --tag bw-frontend:latest

docker-build-pdf-frontend:
	docker build . --target pdf-frontend --tag bw-pdf-frontend:latest

docker-build-backend:
	docker build . --target backend --tag bw-backend:latest

docker-build-ai-service:
	docker build . --target ai-service --tag bw-ai-service:latest
