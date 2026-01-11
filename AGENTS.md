# Vexi Development Guidelines

This file contains build commands, testing instructions, and code style guidelines for agentic coding agents working in the Vexi repository.

## Build Commands

### Development
```bash
# Start all services in development mode
npm run dev

# Start individual services
npm run dev --filter=api          # Node.js API server
cd packages/vexi && npm run play  # TypeScript playground
cd crates/vexi-worker && cargo run # Rust worker
```

### Build & Type Checking
```bash
# Build all packages
npm run build

# Type checking
cd packages/vexi && npm run typecheck
```

### Infrastructure
```bash
# Start database services (PostgreSQL + Redis)
docker-compose up -d

# Stop services
docker-compose down

# View logs
docker-compose logs -f
```

## Testing

### Current Status
- No test framework is currently configured
- Placeholder test commands exist in package.json files
- Testing setup needs to be implemented

### Recommended Testing Setup
```bash
# TypeScript (packages/vexi, apps/api)
npm install --save-dev vitest @vitest/ui

# Rust (crates/vexi-worker)
cargo test                    # Built-in Rust testing
```

### Running Tests (Once Configured)
```bash
# Run all tests
npm test

# Run single test file
npm test path/to/test.test.ts

# Run tests in watch mode
npm test -- --watch

# Rust tests
cd crates/vexi-worker && cargo test
cd crates/vexi-worker && cargo test test_name
```

## Code Style Guidelines

### TypeScript/JavaScript

#### Imports
- Use ES6 imports with explicit named exports
- Group imports: external libraries first, then internal modules
- Use barrel exports (`export * from "./module"`) in index.ts files

```typescript
// External libraries
import { FastifyInstance } from 'fastify';
import { Client } from 'pg';

// Internal modules
import { VType } from './types';
import { defineTable } from './schema';
```

#### Naming Conventions
- **Classes**: PascalCase with `V` prefix (VType, VTable, VSchema)
- **Interfaces**: PascalCase with descriptive names (EmbedConfig, ClientConfig)
- **Functions**: camelCase with descriptive names (defineTable, createClient)
- **Constants**: UPPER_SNAKE_CASE (DEFAULT_EMBED_CONFIG, EMBED_CONFIG_KEY)
- **Types**: Generic type parameters with descriptive names (Shape extends TableShape)
- **Files**: kebab-case for directories, camelCase for files

#### Type Safety
- Use strict TypeScript configuration
- Leverage generics for type-safe APIs
- Prefer explicit return types for public functions
- Use optional chaining (`?.`) and nullish coalescing (`??`)

#### Error Handling
- Use try/catch blocks for async operations
- Throw errors with descriptive messages
- Return proper HTTP status codes in API endpoints
- Use Result types where appropriate

#### Code Organization
- One main export per file when possible
- Use section dividers with `---` comments
- Group related functionality in modules
- Keep files focused and small

### Rust

#### Naming Conventions
- **Functions**: snake_case with descriptive names
- **Structs**: PascalCase with descriptive names (JobPayload)
- **Constants**: UPPER_SNAKE_CASE
- **Modules**: snake_case

#### Error Handling
- Use `anyhow::Result<T>` for error propagation
- Avoid panics in production code
- Use `eprintln!` for error logging, don't crash
- Handle errors gracefully with `?` operator

#### Async Patterns
- Use tokio async/await
- Prefer async traits where applicable
- Handle async operations with proper error propagation

#### Dependencies
- Organize use statements at top of files
- Group by category: std, external crates, internal modules
- Use qualified paths where it improves readability

### General Patterns

#### Configuration
- Use environment variables with dotenv
- Provide sensible defaults
- Separate config from business logic
- Use type-safe configuration objects

#### Database Operations
- Use transactions for multi-step operations
- Handle connection errors gracefully
- Use parameterized queries to prevent SQL injection
- Implement proper connection pooling

#### API Design
- Use RESTful conventions
- Provide clear error messages
- Use appropriate HTTP status codes
- Validate input data

#### Logging
- Use structured logging where possible
- Include relevant context in log messages
- Use emojis for visual clarity in console output
- Log at appropriate levels (info, warn, error)

## Architecture Notes

### Microservices Structure
- **API Server** (Node.js/Fastify): HTTP endpoints and business logic
- **Worker** (Rust): CPU-intensive embedding tasks
- **Queue** (Redis): Async communication between services
- **Database** (PostgreSQL): Single source of truth with pgvector

### Data Flow
1. Client inserts data via API
2. API stores raw data in PostgreSQL
3. API pushes job to Redis queue
4. Rust worker processes job from queue
5. Worker generates embeddings and updates PostgreSQL

### Type Safety
- Schema definition uses fluent API with compile-time type inference
- Optional fields are properly typed
- Embedding configuration is type-safe
- Cross-language consistency between TypeScript and Rust

## Development Workflow

1. Start infrastructure: `docker-compose up -d`
2. Run development: `npm run dev`
3. Make changes with type checking: `npm run typecheck`
4. Test changes: `npm test` (once configured)
5. Build before commit: `npm run build`

## Important Notes

- This is a monorepo managed with Turborepo
- Services communicate via Redis queue
- Database uses pgvector for embeddings
- Type safety is a priority across all languages
- Error handling should be graceful, not crashing