.PHONY: init dev down logs clean

# Initial setup
init:
	npm install
	docker compose up -d mongodb

# Start development environment
dev:
	docker compose up -d mongodb
	npm run dev

# Stop containers
down:
	docker compose down

# View MongoDB logs
logs:
	docker compose logs -f mongodb

# Clean up containers and volumes
clean:
	docker compose down -v
	rm -rf node_modules
	rm -rf dist