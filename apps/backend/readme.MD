# Backend Service

This is a TypeScript-based backend service using GraphQL (Apollo Server) with MongoDB database.

## Prerequisites

- Node.js (v18+ recommended)
- Docker and Docker Compose
- Make (optional, for using make commands)
- pnpm (preferred package manager, see below)

## About pnpm

This project uses [pnpm](https://pnpm.io/) as the preferred package manager. pnpm is a fast, disk space-efficient alternative to npm and yarn. Unlike npm, pnpm uses a content-addressable store and creates symlinks for dependencies, which means:

- Dependencies are installed only once on your machine and shared across projects, saving disk space.
- Installations are much faster, especially in monorepos.
- Projects remain isolated and reproducible.

To install pnpm globally:
```bash
npm install -g pnpm
```
You can still use npm if you prefer, but pnpm is recommended for consistency and speed.

## Setup

1. Install dependencies:
```bash
pnpm install
```

2. Set up environment variables:
```bash
cp .env.example .env
# Then edit .env with your settings
```

3. Start MongoDB:
```bash
docker compose up -d
```

4. Start the development server:
```bash
pnpm run dev
```

## Available Commands

### Package Scripts

- `pnpm run dev` - Start development server with hot-reload
- `pnpm run build` - Build TypeScript code
- `pnpm run watch` - Watch and build TypeScript code
- `pnpm start` - Start production server from built code

(You can substitute `npm` for `pnpm` if needed, but pnpm is recommended.)

### Make Commands

- `make init` - Initial setup (install dependencies and setup MongoDB)
- `make dev` - Start development environment (MongoDB + dev server)
- `make down` - Stop MongoDB container
- `make logs` - View MongoDB container logs
- `make clean` - Stop containers and clean up volumes

## Project Structure

```
src/
├── config/       # Configuration files
├── graphql/      # GraphQL schema and resolvers
└── server.ts     # Main application entry point
```

## Development

The service uses:
- TypeScript for type-safe development
- Apollo Server for GraphQL API
- MongoDB for data storage
- Express.js as the web framework

MongoDB is accessible at `mongodb://root:example@localhost:27017`
